-- ================================================================
-- Ignite Automations SaaS - Database Schema
-- Run this in Supabase SQL Editor
-- ================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------
-- TENANTS (one per restaurant client)
-- ----------------------------------------------------------------
create table tenants (
  id            uuid primary key default uuid_generate_v4(),
  business_name text not null,
  ai_persona_name text not null default 'Maria',
  plan          text not null default 'starter' check (plan in ('starter','growth','scale')),

  -- Vonage credentials (per tenant)
  vonage_api_key    text,
  vonage_api_secret text,
  vonage_number     text,

  -- Telegram
  telegram_bot_token text,

  -- Stripe subscription
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  subscription_status    text default 'trialing',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- USER PROFILES (maps Supabase auth user → tenant + role)
-- ----------------------------------------------------------------
create table user_profiles (
  id        uuid primary key default uuid_generate_v4(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  role      text not null default 'member' check (role in ('admin','member','viewer')),
  full_name text,
  created_at timestamptz default now(),
  unique (user_id)
);

-- ----------------------------------------------------------------
-- MENU ITEMS (per tenant)
-- ----------------------------------------------------------------
create table menu_items (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  description text,
  price       numeric(10,2) not null check (price >= 0),
  category    text default 'General',
  active      boolean default true,
  created_at  timestamptz default now()
);

-- ----------------------------------------------------------------
-- ORDERS
-- ----------------------------------------------------------------
create table orders (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  channel           text not null check (channel in ('voice','sms','telegram','whatsapp','web')),
  customer_phone    text,
  customer_name     text,
  items_description text,
  total             numeric(10,2),
  status            text not null default 'confirmed'
                    check (status in ('confirmed','preparing','ready','delivered','cancelled')),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ----------------------------------------------------------------
-- INDEXES for performance at scale
-- ----------------------------------------------------------------
create index idx_orders_tenant_created  on orders(tenant_id, created_at desc);
create index idx_orders_tenant_status   on orders(tenant_id, status);
create index idx_orders_tenant_channel  on orders(tenant_id, channel);
create index idx_menu_items_tenant      on menu_items(tenant_id, active);
create index idx_user_profiles_user     on user_profiles(user_id);
create index idx_user_profiles_tenant   on user_profiles(tenant_id);

-- ----------------------------------------------------------------
-- ROW LEVEL SECURITY — tenants can only see their own data
-- ----------------------------------------------------------------
alter table tenants       enable row level security;
alter table user_profiles enable row level security;
alter table menu_items    enable row level security;
alter table orders        enable row level security;

-- Helper: get current user's tenant_id
create or replace function get_my_tenant_id()
returns uuid language sql security definer as $$
  select tenant_id from user_profiles where user_id = auth.uid() limit 1;
$$;

-- Tenant policies
create policy "Users see own tenant"
  on tenants for select
  using (id = get_my_tenant_id());

create policy "Admins update own tenant"
  on tenants for update
  using (id = get_my_tenant_id());

-- User profile policies
create policy "Users see own profile"
  on user_profiles for select
  using (user_id = auth.uid() or tenant_id = get_my_tenant_id());

-- Menu item policies
create policy "Tenant members read menu"
  on menu_items for select
  using (tenant_id = get_my_tenant_id());

create policy "Tenant admins manage menu"
  on menu_items for all
  using (tenant_id = get_my_tenant_id());

-- Order policies
create policy "Tenant members read orders"
  on orders for select
  using (tenant_id = get_my_tenant_id());

create policy "Tenant admins manage orders"
  on orders for update
  using (tenant_id = get_my_tenant_id());

-- Service role bypasses RLS (used by the API backend)
-- The API uses SUPABASE_SERVICE_KEY which bypasses RLS automatically

-- ----------------------------------------------------------------
-- UPDATED_AT trigger
-- ----------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_updated_at
  before update on orders
  for each row execute function touch_updated_at();

create trigger tenants_updated_at
  before update on tenants
  for each row execute function touch_updated_at();
