-- =====================================================================
-- PBG Cards & Collectibles HTX: grading orders backend (Supabase)
-- Run this whole file once in Supabase > SQL Editor > New query.
-- Safe to re-run: it uses IF NOT EXISTS / OR REPLACE / ON CONFLICT.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Staff: who can sign in to the iPad app and the staff portal.
-- Create the user in Authentication > Users, then add a row here.
--   role 'owner'   full access, can manage stages
--   role 'staff'   full access to orders
--   role 'partner' Restored Rarity: sees and updates orders with prep work
--   role 'web'     website editor only: Website section of the staff portal, no orders
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null default 'staff',
  created_at timestamptz not null default now()
);

alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('owner','staff','partner','web'));

create or replace function public.staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where user_id = auth.uid()
$$;
create or replace function public.is_shop() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.staff_role() in ('owner','staff'), false)
$$;
create or replace function public.is_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.staff_role() = 'partner', false)
$$;

-- ---------------------------------------------------------------------
-- Grading stages. Each grading company has its own list.
-- Special groups wrap every order:
--   *pre      before anything (checked in at PBG)
--   *partner  only when the order has cleaning / evaluation / repair
--   *ship     the trip to the grading company ({grader} is filled in)
--   *generic  used for any grading company with no list of its own
--   *post     after the cards come back
-- ---------------------------------------------------------------------
create table if not exists public.grader_stages (
  id            bigserial primary key,
  grader        text not null,
  position      int  not null,
  code          text not null unique,
  label         text not null,
  customer_text text not null default '',
  notify_customer boolean not null default true,   -- email the customer when an order reaches this stage
  unique (grader, position)
);
alter table public.grader_stages add column if not exists notify_customer boolean not null default true;

insert into public.grader_stages (grader, position, code, label, customer_text) values
  ('*pre',     1, 'checked_in',        'Checked in at PBG',             'Your cards are at the shop and logged on your ticket.'),
  ('*partner', 1, 'at_partner',        'With Restored Rarity for prep', 'Your cards are with our partner, Restored Rarity TCG, for cleaning or a pre-grade evaluation.'),
  ('*partner', 2, 'prep_done',         'Prep complete',                 'Prep is finished and your cards are back at PBG.'),
  ('*ship',    1, 'shipped_to_grader', 'On the way to {grader}',        'Your cards are packed and shipped to {grader} with our next submission.'),

  ('PSA', 1, 'psa_arrived',     'Arrived at PSA',  'PSA has the package. It is waiting to be opened and logged.'),
  ('PSA', 2, 'psa_order_prep',  'Order prep',      'PSA opened the submission and logged it. Their turnaround clock starts here.'),
  ('PSA', 3, 'psa_research_id', 'Research & ID',   'PSA is identifying each card so the label is correct.'),
  ('PSA', 4, 'psa_grading',     'Grading',         'Your cards are being graded.'),
  ('PSA', 5, 'psa_assembly',    'Assembly',        'Graded cards are being sealed in slabs with their labels.'),
  ('PSA', 6, 'psa_qa1',         'QA check 1',      'First quality check on the slabs and labels.'),
  ('PSA', 7, 'psa_qa2',         'QA check 2',      'Final quality check before PSA ships the order.'),
  ('PSA', 8, 'psa_shipped',     'Shipped from PSA','PSA shipped your cards back to PBG.'),

  ('CGC', 1, 'cgc_arrived',     'Arrived at CGC',                    'CGC has the package. It is waiting to be opened and logged.'),
  ('CGC', 2, 'cgc_received',    'Received',                          'CGC opened the submission and entered it into their system.'),
  ('CGC', 3, 'cgc_scheduled',   'Scheduled for grading',             'Your cards are in line for graders.'),
  ('CGC', 4, 'cgc_grading',     'Grading, encapsulation & imaging',  'Your cards are being graded, slabbed and photographed.'),
  ('CGC', 5, 'cgc_qc',          'Quality control',                   'Final quality check before CGC ships the order.'),
  ('CGC', 6, 'cgc_shipped',     'Shipped from CGC',                  'CGC shipped your cards back to PBG.'),

  ('BGS', 1, 'bgs_arrived',      'Arrived at Beckett', 'Beckett has the package. It is waiting to be opened and logged.'),
  ('BGS', 2, 'bgs_invoiced',     'Invoiced',           'Beckett logged and invoiced the submission.'),
  ('BGS', 3, 'bgs_verification', 'Verification',       'Beckett is verifying each card against the submission.'),
  ('BGS', 4, 'bgs_grading',      'Grading',            'Your cards are being graded and slabbed.'),
  ('BGS', 5, 'bgs_shipped',      'Shipped from Beckett','Beckett shipped your cards back to PBG.'),

  ('SGC', 1, 'sgc_arrived',  'Arrived at SGC',  'SGC has the package. It is waiting to be opened and logged.'),
  ('SGC', 2, 'sgc_received', 'Received',        'SGC opened the submission and entered it into their system.'),
  ('SGC', 3, 'sgc_grading',  'Grading',         'Your cards are being graded and slabbed.'),
  ('SGC', 4, 'sgc_qc',       'Quality control', 'Final quality check before SGC ships the order.'),
  ('SGC', 5, 'sgc_shipped',  'Shipped from SGC','SGC shipped your cards back to PBG.'),

  ('TAG', 1, 'tag_arrived',  'Arrived at TAG',          'TAG has the package. It is waiting to be opened and logged.'),
  ('TAG', 2, 'tag_received', 'Received',                'TAG opened the submission and entered each card.'),
  ('TAG', 3, 'tag_grading',  'Grading',                 'Your cards are being imaged and graded.'),
  ('TAG', 4, 'tag_slabbing', 'Encapsulation & imaging', 'Graded cards are being sealed in slabs and photographed.'),
  ('TAG', 5, 'tag_qa',       'Quality check',           'Final quality check before TAG ships the order.'),
  ('TAG', 6, 'tag_shipped',  'Shipped from TAG',        'TAG shipped your cards back to PBG.'),

  ('*generic', 1, 'gen_arrived', 'Arrived at {grader}', '{grader} has your cards.'),
  ('*generic', 2, 'gen_grading', 'Grading',             'Your cards are being graded.'),
  ('*generic', 3, 'gen_shipped', 'Shipped from {grader}', '{grader} shipped your cards back to PBG.'),

  ('*post', 1, 'ready',     'Ready for pickup', 'Your cards are back at PBG. Bring your ticket number and a photo ID.'),
  ('*post', 2, 'picked_up', 'Picked up',        'You picked up your cards. Thanks for submitting with PBG.')
on conflict (code) do nothing;

-- Quieter defaults: skip emails for short in-between steps. Change any row to true/false later.
update public.grader_stages set notify_customer = false
 where code in ('psa_order_prep','psa_qa1','psa_qa2','cgc_received','cgc_qc','bgs_invoiced','sgc_received','sgc_qc','tag_received','tag_qa');

-- ---------------------------------------------------------------------
-- Orders, cards, stage history
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  ticket           text not null unique,
  public_token     uuid not null unique default gen_random_uuid(),  -- the customer's private link
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  customer_first   text not null,
  customer_last    text not null,
  phone            text not null,
  email            text,
  contact_pref     text,
  customer_notes   text,
  grader           text not null,           -- 'PSA', 'CGC', 'BGS', 'SGC', ... or 'None'
  tier             text,
  grade_each       numeric(10,2) default 0,     -- customer price per graded card (company fee + PBG handling)
  grader_fee_each  numeric(10,2) default 0,     -- what the grading company charges per card
  graded_count     int default 0,
  eval_count       int default 0,               -- full evaluations sold
  prep_count       int default 0,               -- preps sold
  gem_count        int default 0,               -- gem services (graded cards over $4,000, magnetic case)
  gem_fees         numeric(10,2) default 0,     -- $40 / $60 / $80 / $100 by declared value
  grader_fees      numeric(10,2) default 0,     -- owed to the grading company
  pbg_share        numeric(10,2) default 0,     -- PBG's cut (split rules at the time of the order)
  rr_share         numeric(10,2) default 0,     -- Restored Rarity's cut
  has_prep         boolean not null default false,
  if_low_grade     text,
  subtotal         numeric(10,2) default 0,
  tax              numeric(10,2) default 0,
  total            numeric(10,2) default 0,
  payment_when     text,
  payment_method   text,
  signed_name      text,
  signature_path   text,
  received_by      text,             -- employee who checked the cards and entered their code
  current_stage    text not null default 'checked_in',
  grader_order_no  text,                    -- e.g. the PSA submission number
  outbound_tracking text,
  return_tracking  text,
  internal_notes   text,
  rr_code          text              -- Restored Rarity submission code for repair cards (e.g. RR-1042)
);
alter table public.orders add column if not exists rr_code text;
alter table public.orders add column if not exists mag_count int default 0;              -- matching magnetic slab cases sold ($15, handed over at pickup)
alter table public.orders add column if not exists mag_fees  numeric(10,2) default 0;
-- Pickup / unclaimed-card policy (terms section 10)
alter table public.orders add column if not exists mailing_address     text;
alter table public.orders add column if not exists pickup_policy_ack   boolean not null default false;
alter table public.orders add column if not exists final_notice_at     timestamptz;  -- date the certified-mail final notice was sent
alter table public.orders add column if not exists final_notice_tracking text;       -- USPS certified mail number
alter table public.orders add column if not exists pickup_deadline     date;         -- deadline stated in the final notice
alter table public.orders add column if not exists abandoned_at        timestamptz;  -- recorded only after the deadline passes
alter table public.orders add column if not exists ready_at            timestamptz;  -- first "Ready for pickup" notice; starts the 30-day free period
create index if not exists orders_stage_idx on public.orders (current_stage);
create index if not exists orders_created_idx on public.orders (created_at desc);

create table if not exists public.cards (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  position        int  not null,
  category        text,
  name            text not null,
  year            text,
  set_name        text,
  card_number     text,
  variant         text,
  declared_value  numeric(10,2) default 0,
  clean           boolean not null default false,
  eval            boolean not null default false,
  repair          boolean not null default false,
  gem             boolean not null default false,  -- gem service: declared over $4,000, magnetic case
  gem_fee         numeric(10,2) default 0,
  repair_note     text,
  front_path      text,
  back_path       text,
  eval_result     text,      -- pre-grade evaluation result from Restored Rarity
  repair_quote    numeric(10,2),
  grade           text,      -- final grade, e.g. 'PSA 10'
  cert_number     text,
  card_status     text,      -- e.g. 'Pulled, not worth grading'
  unique (order_id, position)
);

create table if not exists public.stage_events (
  id                 bigserial primary key,
  order_id           uuid not null references public.orders(id) on delete cascade,
  stage              text not null,
  note               text,
  visible_to_customer boolean not null default true,
  email_customer     boolean not null default false,
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  created_by_name    text
);
alter table public.stage_events add column if not exists email_customer boolean not null default false;
create index if not exists stage_events_order_idx on public.stage_events (order_id, created_at);

-- First history entry when an order is created
create or replace function public.orders_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.stage_events (order_id, stage, note, email_customer, created_by_name)
  values (new.id, new.current_stage, 'Cards accepted at PBG by ' || coalesce(new.received_by, 'staff'), true,
          (select name from public.staff where user_id = auth.uid()));
  return new;
end $$;
drop trigger if exists orders_after_insert on public.orders;
create trigger orders_after_insert after insert on public.orders
  for each row execute function public.orders_after_insert();

-- Move an order to a stage and log it (used by the staff portal)
drop function if exists public.set_order_stage(uuid, text, text, boolean);
create or replace function public.set_order_stage(p_order uuid, p_stage text, p_note text default null, p_visible boolean default true, p_email boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text := public.staff_role();
begin
  if v_role is null then raise exception 'Not signed in as PBG staff'; end if;
  if v_role = 'partner' then
    if p_stage not in ('at_partner','prep_done') then raise exception 'Partners can only set prep stages'; end if;
    if not exists (select 1 from public.orders where id = p_order and has_prep) then raise exception 'Order has no prep work'; end if;
  end if;
  if not exists (select 1 from public.grader_stages where code = p_stage) then raise exception 'Unknown stage %', p_stage; end if;
  update public.orders set current_stage = p_stage, updated_at = now(),
         ready_at = case when p_stage = 'ready' then coalesce(ready_at, now()) else ready_at end
   where id = p_order;
  insert into public.stage_events (order_id, stage, note, visible_to_customer, email_customer, created_by_name)
  values (p_order, p_stage, nullif(trim(p_note), ''), p_visible,
          p_visible and coalesce(p_email, (select notify_customer from public.grader_stages where code = p_stage), false),
          (select name from public.staff where user_id = auth.uid()));
end $$;

-- What a customer sees on their private link. No phone, email, notes or totals beyond their own ticket.
create or replace function public.get_order_status(p_token uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ticket', o.ticket, 'first_name', o.customer_first, 'created_at', o.created_at,
    'grader', o.grader, 'tier', o.tier, 'has_prep', o.has_prep, 'current_stage', o.current_stage,
    'total', o.total, 'payment_when', o.payment_when, 'return_tracking', o.return_tracking,
    'cards', coalesce((select json_agg(json_build_object(
        'position', c.position, 'name', c.name, 'year', c.year, 'set_name', c.set_name, 'card_number', c.card_number,
        'variant', c.variant, 'category', c.category, 'clean', c.clean, 'eval', c.eval, 'repair', c.repair, 'gem', c.gem, 'gem_fee', c.gem_fee,
        'front_path', c.front_path, 'eval_result', c.eval_result, 'repair_quote', c.repair_quote,
        'grade', c.grade, 'cert_number', c.cert_number, 'card_status', c.card_status) order by c.position)
      from public.cards c where c.order_id = o.id), '[]'::json),
    'events', coalesce((select json_agg(json_build_object('stage', e.stage, 'note', e.note, 'at', e.created_at) order by e.created_at)
      from public.stage_events e where e.order_id = o.id and e.visible_to_customer), '[]'::json)
  )
  from public.orders o where o.public_token = p_token
$$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.staff         enable row level security;
alter table public.grader_stages enable row level security;
alter table public.orders        enable row level security;
alter table public.cards         enable row level security;
alter table public.stage_events  enable row level security;

drop policy if exists staff_self on public.staff;
create policy staff_self on public.staff for select to authenticated using (user_id = auth.uid() or public.is_shop());

drop policy if exists stages_read on public.grader_stages;
create policy stages_read on public.grader_stages for select to anon, authenticated using (true);
drop policy if exists stages_write on public.grader_stages;
create policy stages_write on public.grader_stages for all to authenticated
  using (public.staff_role() = 'owner') with check (public.staff_role() = 'owner');

drop policy if exists orders_shop on public.orders;
create policy orders_shop on public.orders for all to authenticated using (public.is_shop()) with check (public.is_shop());
drop policy if exists orders_partner_read on public.orders;
create policy orders_partner_read on public.orders for select to authenticated using (public.is_partner() and has_prep);

drop policy if exists cards_shop on public.cards;
create policy cards_shop on public.cards for all to authenticated using (public.is_shop()) with check (public.is_shop());
drop policy if exists cards_partner on public.cards;
create policy cards_partner on public.cards for select to authenticated
  using (public.is_partner() and exists (select 1 from public.orders o where o.id = order_id and o.has_prep));
drop policy if exists cards_partner_update on public.cards;
create policy cards_partner_update on public.cards for update to authenticated
  using (public.is_partner() and (clean or eval or repair)) with check (public.is_partner() and (clean or eval or repair));

drop policy if exists events_shop on public.stage_events;
create policy events_shop on public.stage_events for select to authenticated using (public.is_shop());
drop policy if exists events_partner on public.stage_events;
create policy events_partner on public.stage_events for select to authenticated
  using (public.is_partner() and exists (select 1 from public.orders o where o.id = order_id and o.has_prep));

grant execute on function public.get_order_status(uuid) to anon, authenticated;
grant execute on function public.set_order_stage(uuid, text, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Photo storage
--   card-photos: public bucket, but every file sits under the order's
--                random private token, so paths can't be guessed.
--   signatures:  private, staff only.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('card-photos', 'card-photos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('signatures', 'signatures', false) on conflict (id) do nothing;

drop policy if exists "pbg photos write" on storage.objects;
create policy "pbg photos write" on storage.objects for insert to authenticated
  with check (bucket_id in ('card-photos','signatures') and public.is_shop());
drop policy if exists "pbg photos update" on storage.objects;
create policy "pbg photos update" on storage.objects for update to authenticated
  using (bucket_id in ('card-photos','signatures') and public.is_shop());
drop policy if exists "pbg signatures read" on storage.objects;
drop policy if exists "pbg files read" on storage.objects;
create policy "pbg files read" on storage.objects for select to authenticated
  using (bucket_id in ('card-photos','signatures') and public.is_shop());

-- =====================================================================
-- Email automation
-- Every new history entry calls the pbg-notify Edge Function, which
-- decides who to email (customer, PBG, Restored Rarity) and sends it
-- through Resend. See SETUP.md, step 4.
-- =====================================================================
create extension if not exists pg_net with schema extensions;

-- Private settings, readable only by the database itself (no policies on purpose)
create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;

create table if not exists public.email_log (
  id         bigserial primary key,
  order_id   uuid references public.orders(id) on delete cascade,
  event_id   bigint,
  kind       text not null,          -- receipt, update, shop_new, partner_new, partner_handoff
  to_email   text not null,
  status     text not null,          -- sent / failed / skipped
  error      text,
  created_at timestamptz not null default now(),
  unique (event_id, kind)
);
alter table public.email_log enable row level security;
drop policy if exists email_log_shop on public.email_log;
create policy email_log_shop on public.email_log for select to authenticated using (public.is_shop());

create or replace function public.stage_events_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.app_settings where key = 'notify_url';
  select value into v_secret from public.app_settings where key = 'notify_secret';
  if v_url is null or v_url = '' then return new; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-pbg-secret', coalesce(v_secret, '')),
    body    := jsonb_build_object('event_id', new.id)
  );
  return new;
end $$;
drop trigger if exists stage_events_notify on public.stage_events;
create trigger stage_events_notify after insert on public.stage_events
  for each row execute function public.stage_events_notify();

-- After deploying the function, run these two lines with your values (SETUP.md, step 4):
-- insert into public.app_settings values ('notify_url', 'https://YOUR-PROJECT.supabase.co/functions/v1/pbg-notify') on conflict (key) do update set value = excluded.value;
-- insert into public.app_settings values ('notify_secret', 'PASTE-THE-SAME-SECRET-YOU-SET-ON-THE-FUNCTION') on conflict (key) do update set value = excluded.value;

-- =====================================================================
-- Payouts: grading fees owed, PBG share, Restored Rarity share
-- Owners and the Restored Rarity partner can run it; no customer details.
-- =====================================================================
alter table public.orders add column if not exists grader_fee_each numeric(10,2) default 0;
alter table public.orders add column if not exists graded_count int default 0;
alter table public.orders add column if not exists eval_count int default 0;
alter table public.orders add column if not exists prep_count int default 0;
alter table public.orders add column if not exists gem_count int default 0;
alter table public.orders add column if not exists gem_fees numeric(10,2) default 0;
alter table public.cards add column if not exists gem_fee numeric(10,2) default 0;
alter table public.cards add column if not exists gem boolean not null default false;
alter table public.orders add column if not exists grader_fees numeric(10,2) default 0;
alter table public.orders add column if not exists pbg_share numeric(10,2) default 0;
alter table public.orders add column if not exists rr_share numeric(10,2) default 0;

alter table public.cards add column if not exists mag_case boolean not null default false;  -- matching magnetic slab case at pickup
drop function if exists public.payout_report(date, date);
create or replace function public.payout_report(p_from date, p_to date)
returns table (ticket text, created_at timestamptz, grader text, tier text, current_stage text, graded_count int, eval_count int,
               prep_count int, gem_count int, gem_fees numeric, mag_count int, mag_fees numeric, total numeric, tax numeric, grader_fees numeric, pbg_share numeric, rr_share numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.staff_role(), '') not in ('owner','partner') then raise exception 'Only owners and the partner can see payouts'; end if;
  return query
    select o.ticket, o.created_at, o.grader, o.tier, o.current_stage, o.graded_count, o.eval_count, o.prep_count, o.gem_count, o.gem_fees, o.mag_count, o.mag_fees,
           o.total, o.tax, o.grader_fees, o.pbg_share, o.rr_share
    from public.orders o
    where o.created_at >= p_from and o.created_at < (p_to + 1)
    order by o.created_at;
end $$;
grant execute on function public.payout_report(date, date) to authenticated;

-- =====================================================================
-- Pricing rules (single source of truth for every iPad)
-- The iPad loads these on start and saves changes here from Staff > Settings.
-- The database works out PBG's and Restored Rarity's shares itself when an
-- order is created, so the split can't drift between iPads. Changing the
-- rules only affects new orders; past orders keep the shares they were given.
-- =====================================================================
create table if not exists public.pricing (
  id          int primary key default 1 check (id = 1),
  rules       jsonb not null,          -- markup, add-on prices, gem tiers, split
  graders     jsonb,                   -- grading companies, levels, fees, open/paused
  updated_at  timestamptz not null default now(),
  updated_by  text
);
insert into public.pricing (id, rules) values (1, '{"markup": 20, "evalPrice": 17, "prepPrice": 7, "gemTiers": [{"over": 4000, "fee": 40}, {"over": 6000, "fee": 60}, {"over": 8000, "fee": 80}, {"over": 10000, "fee": 100}], "magPrice": 15, "split": {"pbgPerGrade": 12, "rrPerGrade": 8, "pbgPerEval": 2, "pbgPerPrep": 2, "pbgGemPct": 70, "pbgMagPct": 100}, "pricesChecked": "Nov 9, 2026"}'::jsonb)
on conflict (id) do update set rules = excluded.rules, updated_at = now(), updated_by = 'schema.sql';

alter table public.pricing enable row level security;
drop policy if exists pricing_read on public.pricing;
create policy pricing_read on public.pricing for select to authenticated using (public.is_shop() or public.is_partner());
drop policy if exists pricing_write on public.pricing;
create policy pricing_write on public.pricing for update to authenticated using (public.is_shop()) with check (public.is_shop());

-- Shares are calculated here from the order's counts and the current rules.
create or replace function public.orders_apply_split() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; sp jsonb; pct numeric; mpct numeric;
begin
  select rules into r from public.pricing where id = 1;
  if r is null then return new; end if;
  sp := r->'split'; pct := coalesce((sp->>'pbgGemPct')::numeric, 0); mpct := coalesce((sp->>'pbgMagPct')::numeric, 100);
  new.pbg_share := round(
      coalesce(new.graded_count,0) * coalesce((sp->>'pbgPerGrade')::numeric,0)
    + coalesce(new.eval_count,0)   * coalesce((sp->>'pbgPerEval')::numeric,0)
    + coalesce(new.prep_count,0)   * coalesce((sp->>'pbgPerPrep')::numeric,0)
    + coalesce(new.gem_fees,0) * pct / 100
    + coalesce(new.mag_fees,0) * mpct / 100, 2);
  new.rr_share := round(
      coalesce(new.graded_count,0) * coalesce((sp->>'rrPerGrade')::numeric,0)
    + coalesce(new.eval_count,0)   * (coalesce((r->>'evalPrice')::numeric,0) - coalesce((sp->>'pbgPerEval')::numeric,0))
    + coalesce(new.prep_count,0)   * (coalesce((r->>'prepPrice')::numeric,0) - coalesce((sp->>'pbgPerPrep')::numeric,0))
    + coalesce(new.gem_fees,0) * (100 - pct) / 100
    + coalesce(new.mag_fees,0) * (100 - mpct) / 100, 2);
  return new;
end $$;
drop trigger if exists orders_apply_split on public.orders;
create trigger orders_apply_split before insert on public.orders
  for each row execute function public.orders_apply_split();


-- =====================================================================
-- Website content (staff portal > Website). One row per section.
-- Owners and 'web' accounts can edit; anyone can read through site_get(),
-- which the public website calls on every page load. Sections that were
-- never saved are missing and the site shows the text built into index.html.
-- =====================================================================
create or replace function public.can_edit_site() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.staff_role() in ('owner','web'), false)
$$;

create table if not exists public.site_content (
  key        text primary key check (key in ('business','announcement','hero','promos','events','shop','instagram')),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.site_content enable row level security;
drop policy if exists site_edit on public.site_content;
create policy site_edit on public.site_content for all to authenticated
  using (public.can_edit_site()) with check (public.can_edit_site());

create or replace function public.site_content_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select name from public.staff where user_id = auth.uid()), auth.jwt() ->> 'email', new.updated_by);
  return new;
end $$;
drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch before insert or update on public.site_content
  for each row execute function public.site_content_touch();

-- Everything the public website needs: the saved sections plus the public grading prices.
create or replace function public.site_get()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_object_agg(key, value) from public.site_content), '{}'::jsonb)
      || jsonb_build_object('pricing', (select jsonb_build_object(
           'markup', rules->'markup', 'evalPrice', rules->'evalPrice', 'prepPrice', rules->'prepPrice',
           'gemTiers', rules->'gemTiers', 'magPrice', rules->'magPrice') from public.pricing where id = 1));
$$;
grant execute on function public.site_get() to anon, authenticated;

-- Photos uploaded from the Website section (hero, promos, events, Instagram, shop).
insert into storage.buckets (id, name, public) values ('site-media', 'site-media', true) on conflict (id) do nothing;
drop policy if exists site_media_insert on storage.objects;
create policy site_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.can_edit_site());
drop policy if exists site_media_update on storage.objects;
create policy site_media_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.can_edit_site());
drop policy if exists site_media_delete on storage.objects;
create policy site_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.can_edit_site());
