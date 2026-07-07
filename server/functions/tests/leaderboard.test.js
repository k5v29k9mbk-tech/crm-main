/**
 * Unit tests for the pure helpers in endpoints/leaderboard.js.
 *
 * These cover the aggregation/ranking maths and the gamification signal
 * computations (leads, streak, rank movement, period boundaries) without
 * touching Supabase — the DB calls in the route handlers are exercised
 * separately via the emulator.
 */
const {
  aggregateLeaderboard,
  getLastMonthRange,
  getLastWeekRange,
  toUTCDateString,
  countLeadsByAgent,
  computeStreaks,
  shiftRangeBack,
  computeRankDeltas,
} = require('../endpoints/leaderboard');

const agents = [
  { id: 'a', first_name: 'Ada', last_name: 'Lovelace' },
  { id: 'b', first_name: 'Bo', last_name: 'Diddley' },
  { id: 'c', first_name: 'Cy', last_name: 'Young' },
];

describe('aggregateLeaderboard', () => {
  test('annualizes premium (x12), counts sales, sorts desc, keeps agentId', () => {
    const policies = [
      { writing_agent_id: 'a', premium_amount: 100 },
      { writing_agent_id: 'a', premium_amount: 50 },
      { writing_agent_id: 'b', premium_amount: 200 },
    ];
    const result = aggregateLeaderboard(agents, policies);
    expect(result.map((r) => r.agentId)).toEqual(['b', 'a']);
    expect(result[0]).toMatchObject({
      agentId: 'b',
      name: 'Bo Diddley',
      count: 1,
      premiumAmount: 2400, // 200 * 12
    });
    expect(result[1].premiumAmount).toBe(1800); // (100 + 50) * 12
  });

  test('drops agents with zero sales', () => {
    const result = aggregateLeaderboard(agents, [
      { writing_agent_id: 'a', premium_amount: 10 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe('a');
  });

  test('splits credit between writing and split agent by share', () => {
    const policies = [
      {
        writing_agent_id: 'a',
        premium_amount: 100,
        split_agent_id: 'b',
        split_agent_share: 40,
      },
    ];
    const result = aggregateLeaderboard(agents, policies);
    const byId = Object.fromEntries(result.map((r) => [r.agentId, r]));
    // annual = 1200; writer keeps 60%, split gets 40%
    expect(byId.a.premiumAmount).toBeCloseTo(720);
    expect(byId.b.premiumAmount).toBeCloseTo(480);
    expect(byId.a.count).toBe(1);
    expect(byId.b.count).toBe(1);
  });

  test('handles null/empty policies without throwing', () => {
    expect(aggregateLeaderboard(agents, null)).toEqual([]);
    expect(aggregateLeaderboard(agents, [])).toEqual([]);
  });
});

describe('getLastMonthRange', () => {
  test('returns the previous calendar month', () => {
    const r = getLastMonthRange(new Date('2026-03-15T12:00:00Z'));
    expect(r).toMatchObject({
      start: '2026-02-01',
      end: '2026-02-28',
      label: 'February 2026',
    });
  });

  test('crosses the year boundary correctly', () => {
    const r = getLastMonthRange(new Date('2026-01-10T00:00:00Z'));
    expect(r).toMatchObject({
      start: '2025-12-01',
      end: '2025-12-31',
      label: 'December 2025',
    });
  });
});

describe('getLastWeekRange', () => {
  // Independently compute the Monday on-or-before a date, then assert the
  // range is the completed Mon–Sun week immediately before the current one.
  const mondayOnOrBefore = (d) => {
    const copy = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    while (copy.getUTCDay() !== 1) {
      copy.setUTCDate(copy.getUTCDate() - 1);
    }
    return copy;
  };

  test.each([
    '2026-07-08T12:00:00Z', // a mid-week day
    '2026-07-06T00:00:00Z', // a Monday
    '2026-07-05T23:59:59Z', // a Sunday
    '2026-01-01T09:00:00Z', // year boundary
  ])('gives the prior completed Mon–Sun for %s', (iso) => {
    const now = new Date(iso);
    const r = getLastWeekRange(now);
    const start = new Date(`${r.start}T00:00:00Z`);
    const end = new Date(`${r.end}T00:00:00Z`);
    expect(start.getUTCDay()).toBe(1); // Monday
    expect(end.getUTCDay()).toBe(0); // Sunday
    expect((end - start) / 86400000).toBe(6); // 7-day span
    const thisMonday = mondayOnOrBefore(now);
    expect((thisMonday - start) / 86400000).toBe(7); // exactly one week back
  });
});

describe('toUTCDateString', () => {
  test('buckets a timestamp into a UTC calendar day', () => {
    expect(toUTCDateString('2026-07-08T23:30:00Z')).toBe('2026-07-08');
  });
  test('returns null for an invalid value', () => {
    expect(toUTCDateString('not-a-date')).toBeNull();
    expect(toUTCDateString(null)).toBeNull();
  });
});

describe('countLeadsByAgent', () => {
  test('tallies leads per agent and ignores rows without an agent', () => {
    const counts = countLeadsByAgent([
      { agent_id: 'a' },
      { agent_id: 'a' },
      { agent_id: 'b' },
      { agent_id: null },
      {},
    ]);
    expect(counts).toEqual({ a: 2, b: 1 });
  });
  test('handles null input', () => {
    expect(countLeadsByAgent(null)).toEqual({});
  });
});

describe('computeStreaks', () => {
  const lead = (agent_id, day) => ({ agent_id, created_at: `${day}T10:00:00Z` });

  test('counts consecutive days ending today', () => {
    const leads = [
      lead('a', '2026-07-08'),
      lead('a', '2026-07-07'),
      lead('a', '2026-07-06'),
    ];
    expect(computeStreaks(leads, '2026-07-08').a).toBe(3);
  });

  test('stays live when the most recent lead was yesterday', () => {
    const leads = [lead('a', '2026-07-07'), lead('a', '2026-07-06')];
    expect(computeStreaks(leads, '2026-07-08').a).toBe(2);
  });

  test('reads 0 when the streak has lapsed (>1 day gap)', () => {
    const leads = [lead('a', '2026-07-05'), lead('a', '2026-07-04')];
    expect(computeStreaks(leads, '2026-07-08').a).toBe(0);
  });

  test('a gap in the middle stops the count', () => {
    const leads = [
      lead('a', '2026-07-08'),
      lead('a', '2026-07-07'),
      // 07-06 missing
      lead('a', '2026-07-05'),
    ];
    expect(computeStreaks(leads, '2026-07-08').a).toBe(2);
  });

  test('multiple leads on the same day count once', () => {
    const leads = [lead('a', '2026-07-08'), lead('a', '2026-07-08')];
    expect(computeStreaks(leads, '2026-07-08').a).toBe(1);
  });
});

describe('shiftRangeBack', () => {
  test('returns the equal-length window immediately before', () => {
    // 7-day window 07-08..07-14 -> previous 7 days 07-01..07-07
    expect(shiftRangeBack('2026-07-08', '2026-07-14')).toEqual({
      start: '2026-07-01',
      end: '2026-07-07',
    });
  });
  test('handles a single-day window', () => {
    expect(shiftRangeBack('2026-07-08', '2026-07-08')).toEqual({
      start: '2026-07-07',
      end: '2026-07-07',
    });
  });
});

describe('computeRankDeltas', () => {
  test('positive = climbed, negative = dropped, null = new entrant', () => {
    // previous: [a, b, c]  current: [c, a, d]
    const deltas = computeRankDeltas(['c', 'a', 'd'], ['a', 'b', 'c']);
    expect(deltas.c).toBe(2); // 2 -> 0, up 2
    expect(deltas.a).toBe(-1); // 0 -> 1, down 1
    expect(deltas.d).toBeNull(); // not previously ranked
  });
});
