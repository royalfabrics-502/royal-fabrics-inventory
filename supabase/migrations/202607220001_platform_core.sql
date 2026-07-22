-- Royal Apex platform core: editions, feature flags, tenant settings, audit diffs, soft delete, and storage metadata.
create extension if not exists "pgcrypto";

create table if not exists editions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  enabled_modules jsonb not null default '[]'::jsonb,
  enabled_features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  enabled boolean not null default false,
  edition_codes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists tenant_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique,
  edition_code text not null default 'textile',
  currency text not null default 'PKR',
  timezone text not null default 'Asia/Karachi',
  language text not null default 'en',
  tax jsonb not null default '{}'::jsonb,
  decimal_precision integer not null default 2,
  measurement_system text not null default 'metric',
  number_format text not null default 'en-PK',
  date_format text not null default 'dd/MM/yyyy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists audit_log_v2 (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'restore')),
  before_json jsonb,
  after_json jsonb,
  changed_columns text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists storage_objects_metadata (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null unique,
  hash text not null,
  mime text not null,
  size_bytes bigint not null,
  checksum text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  unique (hash, checksum, size_bytes)
);

-- Preserve existing ERP history with soft-delete columns on current major tables.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'yarn_entries',
    'production_entries',
    'fabric_entries',
    'outlets',
    'outlet_stock_moves',
    'outlet_sales',
    'payment_entries',
    'expense_entries'
  ] loop
    execute format('alter table if exists %I add column if not exists deleted_at timestamptz', tbl);
    execute format('alter table if exists %I add column if not exists deleted_by uuid references auth.users(id)', tbl);
  end loop;
end $$;

create table if not exists domain_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz
);

insert into editions (code, name, enabled_modules, enabled_features)
values
  ('textile', 'Royal Apex Textile', '["inventory", "production", "treasury", "reports"]'::jsonb, '["manufacturing_enabled", "retail_edition"]'::jsonb),
  ('healthcare', 'Royal Apex Healthcare', '["crm", "treasury", "reports"]'::jsonb, '["healthcare_edition"]'::jsonb),
  ('retail', 'Royal Apex Retail', '["inventory", "crm", "treasury", "reports"]'::jsonb, '["retail_edition"]'::jsonb)
on conflict (code) do nothing;

insert into feature_flags (key, name, description, enabled)
values
  ('ai_enabled', 'AI Enabled', 'Enable Omni AI features.', false),
  ('manufacturing_enabled', 'Manufacturing Enabled', 'Enable production and manufacturing modules.', true),
  ('payroll_enabled', 'Payroll Enabled', 'Enable payroll module.', false),
  ('healthcare_edition', 'Healthcare Edition', 'Enable healthcare edition capabilities.', false),
  ('retail_edition', 'Retail Edition', 'Enable retail edition capabilities.', true)
on conflict (key) do nothing;
