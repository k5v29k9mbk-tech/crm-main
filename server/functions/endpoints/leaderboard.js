const express = require('express');
const logger = require('firebase-functions/logger');
const { supabaseService } = require('../services/supabase');

// eslint-disable-next-line new-cap
const leaderboardRouter = express.Router();

/**
 * Aggregate policies into a ranked leaderboard.
 *
 * Annualizes premium (premium_amount * 12) and splits credit between the
 * writing agent and an optional split agent based on split_agent_share.
 * Agents with no sales are dropped. Returns entries sorted by premiumAmount
 * descending.
 */
const aggregateLeaderboard = (agents, policies) => {
  const agentMap = {};
  for (const agent of agents) {
    agentMap[agent.id] = {
      name: `${agent.first_name ?? ''} ${agent.last_name ?? ''}`.trim(),
      count: 0,
      premiumAmount: 0,
    };
  }

  for (const policy of policies || []) {
    const writingAgentId = policy.writing_agent_id;
    if (!agentMap[writingAgentId]) continue;

    const annualPremium = Number(policy.premium_amount || 0) * 12;
    const splitShare = policy.split_agent_id
      ? Number(policy.split_agent_share || 0)
      : 0;
    const writingShare = 100 - splitShare;

    agentMap[writingAgentId].count += 1;
    agentMap[writingAgentId].premiumAmount +=
      annualPremium * (writingShare / 100);

    if (
      splitShare > 0 &&
      policy.split_agent_id &&
      agentMap[policy.split_agent_id]
    ) {
      agentMap[policy.split_agent_id].count += 1;
      agentMap[policy.split_agent_id].premiumAmount +=
        annualPremium * (splitShare / 100);
    }
  }

  return Object.values(agentMap)
    .filter((a) => a.count > 0)
    .sort((a, b) => b.premiumAmount - a.premiumAmount);
};

// --- Date helpers (UTC, to keep period boundaries stable regardless of the
// server's local timezone). sold_date is stored as a YYYY-MM-DD string. ---

const pad = (n) => String(n).padStart(2, '0');
const toYMD = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The previous calendar month (1st through last day). */
const getLastMonthRange = (now = new Date()) => {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // day 0 of this month = last day of prev
  return {
    start: toYMD(start),
    end: toYMD(end),
    label: start.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
};

/** The most recent completed calendar week (Monday through Sunday). */
const getLastWeekRange = (now = new Date()) => {
  const day = now.getUTCDay(); // 0 = Sun ... 6 = Sat
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
    ),
  );
  const lastMonday = new Date(
    Date.UTC(
      thisMonday.getUTCFullYear(),
      thisMonday.getUTCMonth(),
      thisMonday.getUTCDate() - 7,
    ),
  );
  const lastSunday = new Date(
    Date.UTC(
      lastMonday.getUTCFullYear(),
      lastMonday.getUTCMonth(),
      lastMonday.getUTCDate() + 6,
    ),
  );
  const fmt = (d) =>
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return {
    start: toYMD(lastMonday),
    end: toYMD(lastSunday),
    label: `${fmt(lastMonday)} – ${fmt(lastSunday)}`,
  };
};

/** Fetch org agents + their policies for a range and return the winner (or null). */
const getWinnerForRange = async (agents, agentIds, range) => {
  const { data: policies, error } = await supabaseService
    .from('policies')
    .select('writing_agent_id, premium_amount, split_agent_id, split_agent_share')
    .in('writing_agent_id', agentIds)
    .gte('sold_date', range.start)
    .lte('sold_date', range.end)
    .limit(50000);

  if (error) throw error;

  const ranked = aggregateLeaderboard(agents, policies);
  return {
    periodLabel: range.label,
    startDate: range.start,
    endDate: range.end,
    winner: ranked[0] || null,
  };
};

leaderboardRouter.get('/', async (req, res) => {
  const { startDate, endDate } = req.query;
  // Scope to the requester's own org — never trust a client-supplied orgId,
  // or any authenticated agent could read another org's leaderboard.
  const orgId = req.agent?.org_id;

  if (!orgId) {
    return res.status(403).json({ error: 'No organization for requester' });
  }

  try {
    logger.log('Fetching premium leaderboard', {
      route: '/leaderboard',
      method: 'GET',
      requesterId: req.agent?.id,
      orgId,
      startDate,
      endDate,
    });

    const { data: agents, error: agentsError } = await supabaseService
      .from('agents')
      .select('id, first_name, last_name')
      .eq('org_id', orgId);

    if (agentsError) {
      logger.error('Error fetching agents in endpoints/leaderboard.js', {
        error: agentsError,
      });
      return res.status(500).json({ error: 'Failed to fetch agents' });
    }

    if (!agents || agents.length === 0) {
      return res.status(200).json([]);
    }

    const agentIds = agents.map((a) => a.id);

    // Fetch policies for all agents in the org filtered by sold_date
    let query = supabaseService
      .from('policies')
      .select(
        'writing_agent_id, premium_amount, split_agent_id, split_agent_share',
      )
      .in('writing_agent_id', agentIds)
      // Supabase caps results at 1000 rows by default; raise it so large orgs
      // aren't silently truncated (matches team_leaderboard.js).
      .limit(50000);

    if (startDate) query = query.gte('sold_date', startDate);
    if (endDate) query = query.lte('sold_date', endDate);

    const { data: policies, error: policiesError } = await query;

    if (policiesError) {
      logger.error('Error fetching policies in endpoints/leaderboard.js', {
        error: policiesError,
      });
      return res.status(500).json({ error: 'Failed to fetch policies' });
    }

    const result = aggregateLeaderboard(agents, policies);

    logger.log('Fetched premium leaderboard successfully', {
      route: '/leaderboard',
      method: 'GET',
      requesterId: req.agent?.id,
      count: result.length,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error(
      'Unexpected error fetching leaderboard in endpoints/leaderboard.js',
      { error },
    );
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * Period winner callouts: the top agent for the previous calendar month and
 * the previous completed week. These are fixed periods, independent of the
 * date range selected on the main leaderboard.
 */
leaderboardRouter.get('/period-winners', async (req, res) => {
  // Scope to the requester's own org — never trust a client-supplied orgId.
  const orgId = req.agent?.org_id;

  if (!orgId) {
    return res.status(403).json({ error: 'No organization for requester' });
  }

  try {
    logger.log('Fetching leaderboard period winners', {
      route: '/leaderboard/period-winners',
      method: 'GET',
      requesterId: req.agent?.id,
      orgId,
    });

    const { data: agents, error: agentsError } = await supabaseService
      .from('agents')
      .select('id, first_name, last_name')
      .eq('org_id', orgId);

    if (agentsError) {
      logger.error(
        'Error fetching agents in endpoints/leaderboard.js (period-winners)',
        { error: agentsError },
      );
      return res.status(500).json({ error: 'Failed to fetch agents' });
    }

    if (!agents || agents.length === 0) {
      return res.status(200).json({ lastMonth: null, lastWeek: null });
    }

    const agentIds = agents.map((a) => a.id);

    const [lastMonth, lastWeek] = await Promise.all([
      getWinnerForRange(agents, agentIds, getLastMonthRange()),
      getWinnerForRange(agents, agentIds, getLastWeekRange()),
    ]);

    logger.log('Fetched leaderboard period winners successfully', {
      route: '/leaderboard/period-winners',
      method: 'GET',
      requesterId: req.agent?.id,
    });

    return res.status(200).json({ lastMonth, lastWeek });
  } catch (error) {
    logger.error(
      'Unexpected error fetching period winners in endpoints/leaderboard.js',
      { error },
    );
    return res.status(500).json({ error: 'Failed to fetch period winners' });
  }
});

module.exports = leaderboardRouter;
