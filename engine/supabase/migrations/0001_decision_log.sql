-- Decision log: every atomic answer, every verdict, every action, every outcome.
create extension if not exists pgcrypto;

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  entity_type text not null,          -- 'page' | 'pair' | 'keyword' | 'copy' | 'action'
  entity_id text not null,
  criteria_set_version text not null,
  model_version text not null,        -- as reported in the response, e.g. 'jev-1.13.0'
  question_key text not null,
  answer jsonb not null,
  confidence numeric,
  state_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists decisions_entity_idx on decisions (workspace_id, entity_type, entity_id);
create index if not exists decisions_question_idx on decisions (workspace_id, criteria_set_version, question_key);

create table if not exists verdicts (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  entity_type text not null,
  entity_id text not null,
  verdict text not null,
  rule_version text not null,
  min_confidence numeric,
  reasons jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  verdict_id uuid references verdicts(id),
  status text not null,               -- 'applied' | 'held_as_control' | 'rejected'
  applied_at timestamptz
);

create table if not exists outcomes (
  id uuid primary key default gen_random_uuid(),
  action_id uuid references actions(id),
  horizon_weeks int not null,
  clicks_delta_pct numeric,
  impressions_delta_pct numeric,
  position_delta numeric,
  measured_at timestamptz not null default now()
);
