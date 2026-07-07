// DEV ONLY: client-side random data so the app shows content in guest mode
// (VITE_GUEST_MODE=true) without a real Supabase backend. Mirrors the shape the
// /leads endpoint returns (see server/functions/endpoints/leads.js).

export const isGuestMode =
  import.meta.env.DEV && import.meta.env.VITE_GUEST_MODE === 'true';

// Stand-in agent so hooks/queries that gate on a resolved agent (e.g. useAgent,
// which otherwise calls the backend) work without a Supabase backend.
export const GUEST_AGENT = {
  id: 'guest',
  first_name: 'Guest',
  last_name: 'User',
  email: 'guest@example.com',
  role: 'admin',
  active: true,
  org_id: 'guest-org',
};

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael',
  'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan',
  'Joseph', 'Jessica', 'Thomas', 'Karen', 'Charles', 'Sarah', 'Daniel',
  'Nancy', 'Matthew', 'Lisa', 'Anthony', 'Betty', 'Mark', 'Sandra',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
];
const STATES = [
  'California', 'Texas', 'Florida', 'New York', 'Pennsylvania', 'Illinois',
  'Ohio', 'Georgia', 'North Carolina', 'Michigan', 'Arizona', 'Tennessee',
];
const CARRIERS = [
  ['Mutual of Omaha', 'Living Promise'],
  ['Americo', 'Eagle Premier'],
  ['Aetna', 'Protection Series'],
  ['Transamerica', 'Immediate Solution'],
  ['Gerber Life', 'Guaranteed Whole Life'],
  ['Foresters', 'PlanRight'],
];
const AVAILABILITY = ['Morning', 'Afternoon', 'Evening', 'Weekends'];
const VENDORS = ['Self Generated', 'GSQ', 'Facebook Ads', 'Aged Leads', 'Referral'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const int = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pad = (n) => String(n).padStart(2, '0');

const buildLead = (i) => {
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const age = int(30, 80);
  const now = new Date();
  const dob = new Date(now.getFullYear() - age, int(0, 11), int(1, 28));
  const dateOfBirth = `${dob.getFullYear()}-${pad(dob.getMonth() + 1)}-${pad(
    dob.getDate(),
  )}`;
  const createdAt = new Date(now.getTime() - int(0, 60) * 24 * 3600 * 1000);
  const [carrier, plan] = pick(CARRIERS);
  const faceAmount = int(5, 50) * 1000;

  return {
    id: `guest-lead-${i}`,
    created_at: createdAt.toISOString(),
    createdAtMs: createdAt.getTime(),
    first_name: firstName,
    last_name: lastName,
    email: `${firstName}.${lastName}${i}@example.com`.toLowerCase(),
    phone: `${int(200, 989)}${int(200, 989)}${int(1000, 9999)}`,
    date_of_birth: dateOfBirth,
    age,
    state: pick(STATES),
    availability: chance(0.6) ? pick(AVAILABILITY) : null,
    face_amount: faceAmount,
    premium: int(20, 200),
    smoker: chance(0.25),
    selected_carrier: chance(0.7) ? carrier : null,
    selected_plan: chance(0.7) ? plan : null,
    verified: chance(0.5),
    sold: chance(0.2),
    cholesterol_medication: chance(0.2),
    blood_pressure_medication: chance(0.3),
    height_feet: int(4, 6),
    height_inches: int(0, 11),
    weight_lbs: int(110, 300),
    lead_vendor_name: pick(VENDORS),
  };
};

export const generateGuestLeads = (count = 40) =>
  Array.from({ length: count }, (_, i) => buildLead(i)).sort(
    (a, b) => b.createdAtMs - a.createdAtMs,
  );

// --- Gamified leaderboard sample data (guest mode only) --------------------
// Shape mirrors the /leaderboard endpoint (name, count = sales, premiumAmount)
// plus gamification fields (leads, streak, leadsThisWeek, rankDelta). The
// current guest agent is included so the "Your Progress" card has data.
const GUEST_LEADERBOARD = [
  { name: 'Marcus Bennett', leads: 214, count: 26, premiumAmount: 74200, streak: 12, leadsThisWeek: 31, rankDelta: 0 },
  { name: 'Sofia Ramirez', leads: 198, count: 24, premiumAmount: 69800, streak: 9, leadsThisWeek: 27, rankDelta: 1 },
  { name: 'Derek Chen', leads: 176, count: 21, premiumAmount: 61500, streak: 6, leadsThisWeek: 22, rankDelta: -1 },
  { name: 'Priya Patel', leads: 138, count: 17, premiumAmount: 48200, streak: 3, leadsThisWeek: 12, rankDelta: 1 },
  { name: 'Guest User', leads: 142, count: 15, premiumAmount: 43900, streak: 5, leadsThisWeek: 18, rankDelta: 2, isCurrentUser: true },
  { name: 'James Okoro', leads: 121, count: 12, premiumAmount: 35600, streak: 4, leadsThisWeek: 15, rankDelta: -2 },
  { name: 'Emily Novak', leads: 104, count: 11, premiumAmount: 31200, streak: 0, leadsThisWeek: 8, rankDelta: -1 },
  { name: 'Tyler Brooks', leads: 88, count: 8, premiumAmount: 22400, streak: 2, leadsThisWeek: 9, rankDelta: 0 },
  { name: 'Hannah Kim', leads: 67, count: 6, premiumAmount: 16800, streak: 1, leadsThisWeek: 5, rankDelta: 3 },
  { name: 'Luis Fernandez', leads: 52, count: 5, premiumAmount: 13500, streak: 0, leadsThisWeek: 4, rankDelta: -1 },
  { name: 'Grace Miller', leads: 38, count: 3, premiumAmount: 8200, streak: 0, leadsThisWeek: 3, rankDelta: 0 },
  { name: 'Owen Wright', leads: 21, count: 1, premiumAmount: 2600, streak: 0, leadsThisWeek: 2, rankDelta: -3 },
];

export const generateGuestLeaderboard = () =>
  GUEST_LEADERBOARD.map((row) => ({ ...row }));

export const generateGuestPeriodWinners = () => {
  const [first, second] = GUEST_LEADERBOARD;
  return {
    lastMonth: {
      periodLabel: 'Last month',
      winner: {
        name: first.name,
        count: first.count,
        premiumAmount: first.premiumAmount,
        leads: first.leads,
      },
    },
    lastWeek: {
      periodLabel: 'Last week',
      winner: {
        name: second.name,
        count: second.count,
        premiumAmount: second.premiumAmount,
        leads: second.leads,
      },
    },
  };
};
