// Gamification rules for the leaderboard. Pure functions so they can be reused
// (and unit-tested) independently of the React view.
//
// The scoring is deliberately weighted to reward *lead generation*: every lead
// earns XP on its own, so prospecting activity — not just closed sales — moves
// an agent up the board.

export const LEAD_XP = 10; // XP earned per lead generated
export const SALE_XP = 100; // XP earned per closed sale
export const WEEKLY_LEAD_GOAL = 25; // target leads per agent per week

// Ordered low → high. `min` is the XP required to reach the tier.
export const TIERS = [
  { key: 'rookie', name: 'Rookie', emoji: '🌱', min: 0, color: '#8A9099' },
  { key: 'bronze', name: 'Bronze', emoji: '🥉', min: 500, color: '#CD7F32' },
  { key: 'silver', name: 'Silver', emoji: '🥈', min: 1500, color: '#9AA3AD' },
  { key: 'gold', name: 'Gold', emoji: '🥇', min: 3500, color: '#D4AF37' },
  { key: 'platinum', name: 'Platinum', emoji: '🛡️', min: 7000, color: '#4FA8C5' },
  { key: 'diamond', name: 'Diamond', emoji: '💎', min: 12000, color: '#6C7BE0' },
];

export const computeXp = (row) => {
  const leads = Number(row?.leads) || 0;
  const sales = Number(row?.count) || 0;
  return leads * LEAD_XP + sales * SALE_XP;
};

export const getTier = (xp) => {
  let tier = TIERS[0];
  for (const t of TIERS) {
    if (xp >= t.min) tier = t;
  }
  return tier;
};

// Progress within the current tier and what it takes to reach the next one.
export const getTierProgress = (xp) => {
  const tier = getTier(xp);
  const idx = TIERS.indexOf(tier);
  const next = TIERS[idx + 1] || null;
  const span = next ? next.min - tier.min : 1;
  const into = xp - tier.min;
  const pct = next ? Math.min(100, Math.round((into / span) * 100)) : 100;
  const xpRemaining = next ? Math.max(0, next.min - xp) : 0;
  return { tier, next, pct, xpRemaining };
};

// Rough "how many more leads to level up" — keeps the XP framing anchored to
// the behaviour we want to drive.
export const leadsToNextTier = (xp) => {
  const { xpRemaining, next } = getTierProgress(xp);
  if (!next) return 0;
  return Math.ceil(xpRemaining / LEAD_XP);
};

// Achievement badges. `test` receives a leaderboard row.
export const BADGES = [
  {
    id: 'prospector',
    emoji: '🎯',
    label: 'Prospector',
    desc: '50+ leads generated',
    test: (r) => (Number(r?.leads) || 0) >= 50,
  },
  {
    id: 'century',
    emoji: '⚡',
    label: 'Century Club',
    desc: '100+ leads generated',
    test: (r) => (Number(r?.leads) || 0) >= 100,
  },
  {
    id: 'machine',
    emoji: '🚀',
    label: 'Lead Machine',
    desc: '200+ leads generated',
    test: (r) => (Number(r?.leads) || 0) >= 200,
  },
  {
    id: 'onfire',
    emoji: '🔥',
    label: 'On Fire',
    desc: '5+ day lead streak',
    test: (r) => (Number(r?.streak) || 0) >= 5,
  },
  {
    id: 'closer',
    emoji: '💰',
    label: 'Closer',
    desc: '10+ closed sales',
    test: (r) => (Number(r?.count) || 0) >= 10,
  },
  {
    id: 'rainmaker',
    emoji: '🏆',
    label: 'Rainmaker',
    desc: '$50k+ annual premium',
    test: (r) => (Number(r?.premiumAmount) || 0) >= 50000,
  },
  {
    id: 'sharpshooter',
    emoji: '🌟',
    label: 'Sharpshooter',
    desc: '25%+ lead-to-sale conversion',
    test: (r) => {
      const leads = Number(r?.leads) || 0;
      const sales = Number(r?.count) || 0;
      return leads >= 20 && sales / leads >= 0.25;
    },
  },
];

export const earnedBadges = (row) => BADGES.filter((b) => b.test(row));

// Attach xp + tier and sort a set of rows into ranked order (highest XP first).
export const rankByXp = (rows = []) =>
  rows
    .map((r) => {
      const xp = computeXp(r);
      return { ...r, xp, tier: getTier(xp) };
    })
    .sort((a, b) => b.xp - a.xp);
