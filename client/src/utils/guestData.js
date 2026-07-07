// DEV ONLY: client-side random data so the app shows content in guest mode
// (VITE_GUEST_MODE=true) without a real Supabase backend. Mirrors the shape the
// /leads endpoint returns (see server/functions/endpoints/leads.js).

export const isGuestMode =
  import.meta.env.DEV && import.meta.env.VITE_GUEST_MODE === 'true';

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
