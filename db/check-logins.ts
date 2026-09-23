// Diagnostic: does this database actually contain sign-in-able users, and do
// the demo passwords still match? Prints structure only — never a password
// hash or the connection string.
//
//   npx tsx --env-file=.env.local db/check-logins.ts
import bcrypt from 'bcryptjs';
import { db, pool } from './client';
import { users, tenants, serviceTypes, crews } from './schema';

const DEMO = [
  { label: 'Admin', identifier: 'admin@3u3cleaning.com', password: 'admin123' },
  { label: 'Cleaner', identifier: 'jordan@3u3cleaning.com', password: 'clean123' },
  { label: 'Customer', identifier: '+12815550199', password: 'customer123' },
];

async function main() {
  const tenantRows = await db.select().from(tenants);
  const serviceRows = await db.select().from(serviceTypes);
  const crewRows = await db.select().from(crews);
  const userRows = await db.select().from(users);

  console.log('--- what this database contains ---');
  console.log(`tenants:       ${tenantRows.length}${tenantRows[0] ? ` (${tenantRows[0].name})` : ''}`);
  console.log(`service types: ${serviceRows.length}`);
  console.log(`crews:         ${crewRows.length}`);
  console.log(`users:         ${userRows.length}`);

  if (userRows.length === 0) {
    console.log('\n>>> No users at all. The seed never ran against this database.');
    console.log('>>> Fix: npx tsx --env-file=.env.local db/seed.ts');
    await pool.end();
    return;
  }

  console.log('\n--- users on file ---');
  for (const u of userRows) {
    console.log(
      `${u.role.padEnd(9)} ${(u.email ?? u.phone ?? '(no identifier)').padEnd(28)} ` +
        `password ${u.passwordHash ? 'set' : 'NOT SET — cannot sign in'}`,
    );
  }

  console.log('\n--- can the demo logins actually sign in? ---');
  for (const demo of DEMO) {
    const match = userRows.find((u) => u.email === demo.identifier || u.phone === demo.identifier);
    if (!match) {
      console.log(`${demo.label.padEnd(9)} NO SUCH USER — ${demo.identifier}`);
      continue;
    }
    if (!match.passwordHash) {
      console.log(`${demo.label.padEnd(9)} user exists but has NO PASSWORD set`);
      continue;
    }
    const ok = bcrypt.compareSync(demo.password, match.passwordHash);
    console.log(`${demo.label.padEnd(9)} ${ok ? 'PASSWORD OK — this login should work' : 'PASSWORD DOES NOT MATCH'}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('Check failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
