/**
 * Rankcall local admin. Run from the project folder:
 *
 *   npm run admin -- status                      who owns what
 *   npm run admin -- cleanup-test                remove test accounts (emails ending @example.test) and their sites,
 *                                                and hand back sites that existed before their owner signed up
 *   npm run admin -- give-site <siteId> <email>  move a site to the account of that user
 *
 * Uses DATA_DIR (default ./data). Every command that changes anything first writes a full backup to
 * <DATA_DIR>/backups/app-<time>.db, so it can always be undone by copying that file back while the app is stopped.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));
const file = path.join(dataDir, 'app.db');
const [cmd, ...args] = process.argv.slice(2);

function open(): Database.Database {
  if (!existsSync(file)) { console.error(`No database at ${file}. Start the app once first.`); process.exit(1); }
  const d = new Database(file);
  d.pragma('foreign_keys = ON');
  d.pragma('busy_timeout = 5000');
  return d;
}

async function backup(d: Database.Database): Promise<string> {
  const dir = path.join(dataDir, 'backups');
  mkdirSync(dir, { recursive: true });
  const to = path.join(dir, `app-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  await d.backup(to);
  return to;
}

type SiteRow = { id: string; name: string; domain: string; created_at: string; account_id: string | null; owner: string | null; verdicts: number };

function sites(d: Database.Database): SiteRow[] {
  return d.prepare(`select s.id, s.name, s.domain, s.created_at, s.account_id,
      (select group_concat(u.email, ', ') from users u where u.account_id = s.account_id) as owner,
      (select count(*) from verdicts v where v.site_id = s.id) as verdicts
    from sites s order by s.created_at`).all() as SiteRow[];
}

function status(d: Database.Database) {
  const users = d.prepare('select u.email, u.account_id, a.name as account, a.plan, a.created_at from users u join accounts a on a.id = u.account_id order by a.created_at').all() as { email: string; account_id: string; account: string; plan: string; created_at: string }[];
  console.log(`Database: ${file}\n`);
  console.log(users.length ? 'Accounts:' : 'Accounts: none yet. The first person to sign up claims every unowned site.');
  for (const u of users) console.log(`  ${u.email}  (${u.account}, ${u.plan}, since ${u.created_at.slice(0, 10)})`);
  console.log('\nSites:');
  for (const s of sites(d)) console.log(`  ${s.id}  ${s.name} (${s.domain})  ${s.verdicts} verdicts  owner: ${s.owner ?? 'unowned'}`);
}

async function cleanupTest(d: Database.Database) {
  const testAccounts = d.prepare(`select a.id, a.created_at from accounts a
    where exists (select 1 from users u where u.account_id = a.id)
      and not exists (select 1 from users u where u.account_id = a.id and lower(u.email) not like '%@example.test')`).all() as { id: string; created_at: string }[];
  if (!testAccounts.length) { console.log('No test accounts found. Nothing to do.'); return; }
  const ids = testAccounts.map((a) => a.id);
  const all = sites(d).filter((s) => s.account_id && ids.includes(s.account_id));
  // A site created before its owning test account existed was claimed by that account's sign-up: hand it back.
  const created = new Map(testAccounts.map((a) => [a.id, a.created_at]));
  const handBack = all.filter((s) => s.created_at < (created.get(s.account_id!) ?? ''));
  const remove = all.filter((s) => !handBack.includes(s));
  const to = await backup(d);
  d.transaction(() => {
    for (const s of handBack) d.prepare('update sites set account_id = null where id = ?').run(s.id);
    for (const s of remove) d.prepare('delete from sites where id = ?').run(s.id);
    for (const id of ids) {
      d.prepare('delete from sessions where user_id in (select id from users where account_id = ?)').run(id);
      d.prepare('delete from users where account_id = ?').run(id);
      d.prepare('delete from accounts where id = ?').run(id);
    }
  })();
  console.log(`Backup written to ${to}`);
  for (const s of handBack) console.log(`  Handed back: ${s.name} (${s.id}, ${s.verdicts} verdicts). The next sign-up claims it.`);
  for (const s of remove) console.log(`  Removed test site: ${s.name} (${s.id})`);
  console.log(`  Removed ${ids.length} test account${ids.length === 1 ? '' : 's'}.`);
  const left = d.prepare('select count(*) as n from accounts').get() as { n: number };
  if (left.n === 0) console.log('\nNo accounts left: sign up at http://localhost:3000/signup and your account will own the handed-back sites.');
  else console.log('\nOther accounts exist, so sign-up will not claim sites automatically. Use give-site to move a site to your account.');
}

async function giveSite(d: Database.Database, siteId?: string, email?: string) {
  if (!siteId || !email) { console.error('Usage: npm run admin -- give-site <siteId> <email>'); process.exit(1); }
  const site = d.prepare('select id, name from sites where id = ?').get(siteId) as { id: string; name: string } | undefined;
  const user = d.prepare('select account_id from users where lower(email) = lower(?)').get(email) as { account_id: string } | undefined;
  if (!site) { console.error(`No site with id ${siteId}. Run: npm run admin -- status`); process.exit(1); }
  if (!user) { console.error(`No user with email ${email}. Sign up first.`); process.exit(1); }
  const to = await backup(d);
  d.prepare('update sites set account_id = ? where id = ?').run(user.account_id, site.id);
  console.log(`Backup written to ${to}\nMoved ${site.name} (${site.id}) to ${email}.`);
}

const d = open();
if (cmd === 'status' || !cmd) status(d);
else if (cmd === 'cleanup-test') await cleanupTest(d);
else if (cmd === 'give-site') await giveSite(d, args[0], args[1]);
else { console.error(`Unknown command "${cmd}". Use status, cleanup-test or give-site.`); process.exit(1); }
d.close();
