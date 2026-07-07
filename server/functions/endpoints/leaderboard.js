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
 * descending. Each row carries `agentId` so callers (and the client) can join
 * gamification signals and identify the current user without matching on name.
 */
const aggregateLeaderboard = (agents, policies) => {
  const agentMap = {};
  for (const agent of agents) {
    agentMap[agent.id] = {
      agentId: agent.id,
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

// --- Gamification helpers (pure; exported for unit testing). These decorate
// the premium ranking with lead-generation signals so prospecting activity is
// visible and rewarded — they never change who ranks where. ---

/** Bucket a timestamptz value (leads.created_at) into a UTC calendar day. */
const toUTCDateString = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return toYMD(d);
};

/** { [agentId]: leadCount } for a set of lead rows ({ agent_id, ... }). */
const countLeadsByAgent = (leads) => {
  const counts = {};
  for (const lead of leads || []) {
    const id = lead.agent_id;
    if (!id) continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
};

const minusDaysYMD = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return toYMD(new Date(Date.UTC(y, m - 1, d - n)));
};

/**
 * Consecutive-day lead streak per agent, anchored to `todayYMD` (UTC).
 * A streak only counts as "live" if the agent generated a lead today or
 * yesterday; otherwise it has lapsed and reads 0. Returns { [agentId]: days }.
 */
const computeStreaks = (leads, todayYMD = toYMD(new Date())) => {
  const daysByAgent = {};
  for (const lead of leads || []) {
    const id = lead.agent_id;
    const day = toUTCDateString(lead.created_at);
    if (!id || !day) continue;
    if (!daysByAgent[id]) daysByAgent[id] = new Set();
    daysByAgent[id].add(day);
  }

  const yesterday = minusDaysYMD(todayYMD, 1);
  const streaks = {};
  for (const [id, days] of Object.entries(daysByAgent)) {
    let anchor = days.has(todayYMD)
      ? todayYMD
      : days.has(yesterday)
        ? yesterday
        : null;
    let streak = 0;
    while (anchor && days.has(anchor)) {
      streak += 1;
      anchor = minusDaysYMD(anchor, 1);
    }
    streaks[id] = streak;
  }
  return streaks;
};

/** The equal-length window immediately preceding [start, end] (YYYY-MM-DD). */
const shiftRangeBack = (start, end) => {
  const DAY = 24 * 60 * 60 * 1000;
  const parse = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const lengthDays = Math.round((parse(end) - parse(start)) / DAY) + 1;
  const prevEnd = new Date(parse(start) - DAY);
  const prevStart = new Date(prevEnd.getTime() - (lengthDays - 1) * DAY);
  return { start: toYMD(prevStart), end: toYMD(prevEnd) };
};

/**
 * Given current + previous ranked agentId arrays (index 0 = rank 1), return
 * { [agentId]: delta } where a positive delta means the agent climbed that
 * many spots. Agents absent from the previous ranking get null (no basis for
 * comparison — treated as new entrants by the client).
 */
const computeRankDeltas = (currentIds, previousIds) => {
  const prevRank = {};
  previousIds.forEach((id, i) => {
    prevRank[id] = i;
  });
  const deltas = {};
  currentIds.forEach((id, i) => {
    deltas[id] = id in prevRank ? prevRank[id] - i : null;
  });
  return deltas;
};

/**
 * Best-effort decoration of a premium-ranked leaderboard with lead-generation
 * signals: leads in the selected period, a live daily streak, leads in the last
 * 7 days, and rank movement vs the immediately-preceding equal window. Mutates
 * and returns `ranked`. Any failure here must NOT break the core leaderboard,
 * so callers wrap this in try/catch and fall back to the plain ranking.
 */
const enrichLeaderboard = async (
  ranked,
  { agents, agentIds, startDate, endDate },
) => {
  // Leads generated within the selected period (parallels `count` = sales).
  let periodLeadsQuery = supabaseService
    .from('leads')
    .select('agent_id, created_at')
    .in('agent_id', agentIds)
    .limit(50000);
  if (startDate) periodLeadsQuery = periodLeadsQuery.gte('created_at', startDate);
  if (endDate) {
    periodLeadsQuery = periodLeadsQuery.lte('created_at', `${endDate}T23:59:59.999Z`);
  }

  // Recent leads (last 60 days) drive the live streak + this-week counters,
  // which are current-status signals independent of the selected range.
  const today = new Date();
  const todayYMD = toYMD(today);
  const sixtyDaysAgo = toYMD(new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000));
  const weekAgoYMD = minusDaysYMD(todayYMD, 6);

  const recentLeadsQuery = supabaseService
    .from('leads')
    .select('agent_id, created_at')
    .in('agent_id', agentIds)
    .gte('created_at', sixtyDaysAgo)
    .limit(50000);

  const [periodLeadsRes, recentLeadsRes] = await Promise.all([
    periodLeadsQuery,
    recentLeadsQuery,
  ]);
  if (periodLeadsRes.error) throw periodLeadsRes.error;
  if (recentLeadsRes.error) throw recentLeadsRes.error;

  const periodLeads = countLeadsByAgent(periodLeadsRes.data);
  const streaks = computeStreaks(recentLeadsRes.data, todayYMD);
  const leadsThisWeek = countLeadsByAgent(
    (recentLeadsRes.data || []).filter(
      (l) => toUTCDateString(l.created_at) >= weekAgoYMD,
    ),
  );

  // Rank movement vs the previous equal-length window (only meaningful when a
  // bounded range is selected).
  let rankDeltas = {};
  if (startDate && endDate) {
    const prev = shiftRangeBack(startDate, endDate);
    const { data: prevPolicies, error: prevError } = await supabaseService
      .from('policies')
      .select(
        'writing_agent_id, premium_amount, split_agent_id, split_agent_share',
      )
      .in('writing_agent_id', agentIds)
      .gte('sold_date', prev.start)
      .lte('sold_date', prev.end)
      .limit(50000);
    if (prevError) throw prevError;
    const prevRanked = aggregateLeaderboard(agents, prevPolicies);
    rankDeltas = computeRankDeltas(
      ranked.map((r) => r.agentId),
      prevRanked.map((r) => r.agentId),
    );
  }

  for (const row of ranked) {
    row.leads = periodLeads[row.agentId] || 0;
    row.streak = streaks[row.agentId] || 0;
    row.leadsThisWeek = leadsThisWeek[row.agentId] || 0;
    row.rankDelta = row.agentId in rankDeltas ? rankDeltas[row.agentId] : null;
  }
  return ranked;
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
  const winner = ranked[0] || null;

  // Attach the winner's lead count for the same period (best-effort).
  if (winner) {
    try {
      const { data: leadRows } = await supabaseService
        .from('leads')
        .select('agent_id')
        .eq('agent_id', winner.agentId)
        .gte('created_at', range.start)
        .lte('created_at', `${range.end}T23:59:59.999Z`)
        .limit(50000);
      winner.leads = (leadRows || []).length;
    } catch (leadError) {
      logger.warn('Failed to attach winner lead count', {
        route: '/leaderboard/period-winners',
        error: leadError,
      });
      winner.leads = winner.leads ?? 0;
    }
  }

  return {
    periodLabel: range.label,
    startDate: range.start,
    endDate: range.end,
    winner,
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

    // Decorate with gamification signals. Best-effort: if lead data is
    // unavailable we still return the core premium ranking.
    try {
      await enrichLeaderboard(result, {
        agents,
        agentIds,
        startDate,
        endDate,
      });
    } catch (gamificationError) {
      logger.warn(
        'Gamification enrichment failed; returning base leaderboard',
        { route: '/leaderboard', error: gamificationError },
      );
    }

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
// Pure helpers exported for unit testing (see tests/leaderboard.test.js).
module.exports.aggregateLeaderboard = aggregateLeaderboard;
module.exports.getLastMonthRange = getLastMonthRange;
module.exports.getLastWeekRange = getLastWeekRange;
module.exports.toUTCDateString = toUTCDateString;
module.exports.countLeadsByAgent = countLeadsByAgent;
module.exports.computeStreaks = computeStreaks;
module.exports.shiftRangeBack = shiftRangeBack;
module.exports.computeRankDeltas = computeRankDeltas;
