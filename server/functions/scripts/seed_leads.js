/**
 * Seed the `leads` table with random leads for local/dev testing.
 *
 * Usage (from server/functions):
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed_leads.js [count]
 *
 * `count` defaults to 50. Existing agents and lead vendors are read from the
 * database so the generated leads reference valid foreign keys. If a specific
 * agent is desired, set SEED_AGENT_ID to a single agent id.
 */
const { createClient } = require('@supabase/supabase-js');
const { faker } = require('@faker-js/faker');
const dayjs = require('dayjs');

const SUPABASE_URL = 'https://wtudzhfcxsorxqimarjb.supabase.co';

const count = Number(process.argv[2]) || 50;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

// Carrier / plan pairs used for the "selected" columns.
const CARRIERS = [
  ['Mutual of Omaha', 'Living Promise'],
  ['Americo', 'Eagle Premier'],
  ['Aetna', 'Protection Series'],
  ['Transamerica', 'Immediate Solution'],
  ['Gerber Life', 'Guaranteed Whole Life'],
  ['Foresters', 'PlanRight'],
];
const AVAILABILITY = ['Morning', 'Afternoon', 'Evening', 'Weekends'];
const WHY = [
  'Final expenses',
  'Leave money for family',
  'Cover funeral costs',
  'Mortgage protection',
  'Peace of mind',
];

function buildLead(agentId, leadVendorId) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const phone = faker.string.numeric(10);
  const dob = dayjs(
    faker.date.birthdate({ min: 30, max: 80, mode: 'age' }),
  ).format('YYYY-MM-DD');
  const [carrier, plan] = pick(CARRIERS);
  const heightFeet = faker.number.int({ min: 4, max: 6 });
  const heightInches = faker.number.int({ min: 0, max: 11 });
  const weight = faker.number.int({ min: 110, max: 300 });
  const faceAmount = faker.number.int({ min: 5, max: 50 }) * 1000;

  return {
    first_name: firstName,
    last_name: lastName,
    email: faker.internet
      .email({ firstName, lastName })
      .toLowerCase(),
    phone,
    state: faker.location.state(),
    date_of_birth: dob,
    sold: chance(0.2),
    smoker: chance(0.25),
    face_amount: faceAmount,
    face_amount_max: chance(0.4) ? faceAmount + 10000 : null,
    premium: faker.number.int({ min: 20, max: 200 }),
    selected_carrier: chance(0.7) ? carrier : null,
    selected_plan: chance(0.7) ? plan : null,
    beneficiary: chance(0.6) ? faker.person.fullName() : null,
    priority: null,
    availability: chance(0.6) ? pick(AVAILABILITY) : null,
    why: chance(0.6) ? pick(WHY) : null,
    cholesterol_medication: chance(0.2),
    blood_pressure_medication: chance(0.3),
    verified: chance(0.5),
    height_feet: heightFeet,
    height_inches: heightInches,
    weight_lbs: weight,
    agent_id: agentId,
    lead_vendor_id: leadVendorId,
  };
}

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Set it in the environment before running.',
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, serviceRoleKey);

  // Resolve agent ids (valid FK targets).
  let agentIds = [];
  if (process.env.SEED_AGENT_ID) {
    agentIds = [process.env.SEED_AGENT_ID];
  } else {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id')
      .limit(1000);
    if (error) {
      console.error('Failed to load agents:', error.message);
      process.exit(1);
    }
    agentIds = (agents || []).map((a) => a.id);
  }

  if (!agentIds.length) {
    console.error('No agents found. Create at least one agent first.');
    process.exit(1);
  }

  // Resolve lead vendor ids (nullable FK).
  const { data: vendors, error: vendorError } = await supabase
    .from('lead_vendors')
    .select('id')
    .limit(1000);
  if (vendorError) {
    console.error('Failed to load lead vendors:', vendorError.message);
    process.exit(1);
  }
  const vendorIds = (vendors || []).map((v) => v.id);

  const leads = Array.from({ length: count }, () =>
    buildLead(
      pick(agentIds),
      vendorIds.length ? pick(vendorIds) : null,
    ),
  );

  const { data, error } = await supabase
    .from('leads')
    .insert(leads)
    .select('id');

  if (error) {
    console.error('Failed to insert leads:', error.message);
    process.exit(1);
  }

  console.log(
    `Inserted ${data?.length || 0} random leads across ${agentIds.length} agent(s).`,
  );
}

main();
