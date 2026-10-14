import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
create table if not exists accounts (
  id text primary key,
  name text not null,
  plan text not null default 'trial',          -- trial | starter | growth | scale
  trial_ends_at text not null,
  subscription_status text,                    -- active | trialing | past_due | canceled | null
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at text not null
);
create table if not exists users (
  id text primary key,
  account_id text not null references accounts(id) on delete cascade,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'owner',           -- owner | member
  created_at text not null
);
create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at text not null,
  created_at text not null
);
create table if not exists sites (
  id text primary key,
  name text not null,
  domain text not null,
  sitemap_url text,
  created_at text not null
);
create table if not exists uploads (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  kind text not null,              -- gsc_pages | gsc_queries | ga4 | crawl | backlinks
  source text not null,            -- file | sitemap | sample
  filename text not null,
  period_start text,
  period_end text,
  row_count integer not null,
  notes text not null default '[]',
  data text not null,              -- parsed import as JSON
  created_at text not null
);
create index if not exists uploads_site on uploads(site_id, kind, created_at);
create table if not exists site_urls (
  site_id text not null references sites(id) on delete cascade,
  path text not null,
  template text not null,
  clicks real, impressions real, ctr real, position real, prev_clicks real,
  sessions real, conversions real,
  status integer, indexable integer, title text, word_count integer, inlinks integer, last_modified text,
  referring_domains integer,
  primary key (site_id, path)
);
create table if not exists jobs (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  type text not null,              -- verdicts | crawl
  status text not null,            -- running | done | failed
  progress integer not null default 0,
  total integer not null default 0,
  message text,
  error text,
  provider text,
  model text,
  input_tokens integer not null default 0,
  meta text not null default '{}',
  created_at text not null,
  finished_at text
);
create table if not exists verdicts (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  site_id text not null references sites(id) on delete cascade,
  path text not null,
  template text not null,
  skipped text,
  verdict text,
  probability real not null,
  probabilities text not null,
  router text,
  needs_approval integer not null,
  locked_by text,
  target text,
  target_probability real,
  reasons text not null,
  rules text not null,
  settle text not null,
  impact_low real not null,
  impact_high real not null,
  monthly_clicks real not null,
  monthly_impressions real not null,
  position real,
  bands text,
  state text,
  answers text,
  model text not null,
  status text not null,            -- proposed | approved | rejected
  final_verdict text,
  final_target text,
  reviewed_by text,                -- auto | user
  reviewed_at text
);
create index if not exists verdicts_job on verdicts(job_id);
create table if not exists cannibal_pairs (
  job_id text not null references jobs(id) on delete cascade,
  site_id text not null,
  a text not null, b text not null, primary_path text not null, shared text not null
);
create table if not exists decisions (
  id integer primary key autoincrement,
  job_id text not null references jobs(id) on delete cascade,
  site_id text not null,
  path text not null,
  question_key text not null,
  answer text not null,
  confidence real not null,
  model text not null,
  latency_ms integer not null,
  state_hash text not null,
  criteria_version text not null,
  created_at text not null
);
create index if not exists decisions_job on decisions(job_id, path);
create table if not exists labels (
  id integer primary key autoincrement,
  verdict_id text not null references verdicts(id) on delete cascade,
  site_id text not null,
  path text not null,
  model_verdict text not null,
  model_probability real not null,
  human_verdict text not null,     -- a verdict, or 'rejected'
  reason text,
  created_at text not null
);
create table if not exists tasks (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  verdict_id text references verdicts(id) on delete set null,
  path text not null,
  verdict text not null,
  target text,
  owner text,
  due_date text,
  status text not null,            -- todo | in_progress | done | cancelled
  brief text not null,
  forecast_low real not null,
  forecast_high real not null,
  baseline_clicks_month real not null,
  baseline_target_clicks_month real,
  baseline_site_clicks_month real,
  created_at text not null,
  done_at text
);
create table if not exists outcomes (
  id integer primary key autoincrement,
  task_id text not null references tasks(id) on delete cascade,
  window_days integer not null,
  upload_id text not null,
  after_clicks_month real not null,
  delta real not null,
  label text not null,             -- worked | neutral | backfired
  measured_at text not null,
  unique (task_id, window_days)
);
`;

const globalForDb = globalThis as unknown as { __db?: Database.Database; __schema?: string };

/** Create missing tables and columns. Safe to run repeatedly. */
function migrate(d: Database.Database) {
  d.exec(SCHEMA);
  // Sites created before accounts existed have no owner; add the column and let the first sign-up claim them.
  const cols = d.prepare('pragma table_info(sites)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'account_id')) d.exec('alter table sites add column account_id text references accounts(id) on delete cascade');
}

export function dataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), 'data'));
}

export function db(): Database.Database {
  if (!globalForDb.__db) {
    mkdirSync(dataDir(), { recursive: true });
    const d = new Database(path.join(/*turbopackIgnore: true*/ dataDir(), 'app.db'));
    d.pragma('journal_mode = WAL');
    d.pragma('foreign_keys = ON');
    // Litestream reads the WAL while the app writes; wait briefly for its lock instead of failing.
    d.pragma('busy_timeout = 5000');
    d.pragma('synchronous = NORMAL');
    migrate(d);
    globalForDb.__schema = SCHEMA;
    // Jobs cannot survive a server restart; mark any left running as interrupted.
    d.prepare(`update jobs set status = 'failed', error = 'Interrupted by a server restart. Run it again.', finished_at = ? where status = 'running'`).run(new Date().toISOString());
    globalForDb.__db = d;
  } else if (globalForDb.__schema !== SCHEMA) {
    // In development the connection survives code reloads; apply schema changes to it.
    migrate(globalForDb.__db);
    globalForDb.__schema = SCHEMA;
  }
  return globalForDb.__db;
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
