-- PBG update 2026-11-16b: log of payments from PBG to Restored Rarity, for the year-to-date payout tracker. Safe to run more than once.
create table if not exists public.rr_payments (
  id          uuid primary key default gen_random_uuid(),
  paid_on     date not null,
  amount      numeric(10,2) not null check (amount > 0),
  method      text,
  reference   text,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.rr_payments enable row level security;
drop policy if exists rr_payments_read on public.rr_payments;
create policy rr_payments_read on public.rr_payments for select to authenticated
  using (coalesce(public.staff_role(), '') in ('owner','partner'));
drop policy if exists rr_payments_add on public.rr_payments;
create policy rr_payments_add on public.rr_payments for insert to authenticated
  with check (coalesce(public.staff_role(), '') in ('owner','partner'));
drop policy if exists rr_payments_delete on public.rr_payments;
create policy rr_payments_delete on public.rr_payments for delete to authenticated
  using (coalesce(public.staff_role(), '') = 'owner');
grant select, insert, delete on public.rr_payments to authenticated;
