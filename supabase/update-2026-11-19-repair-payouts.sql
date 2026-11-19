-- PBG update 2026-11-19: repair money owed to Scott (Restored Rarity) is its own
-- figure, and payouts PBG makes to him are a separate log.
-- Safe to re-run.
--
-- Shop staff can read the balance from the portal. They cannot add, change,
-- or delete a payout. The only write path is an RPC that checks a bcrypt hash
-- only Scott knows. The code itself is never stored in this repo. Scott sets
-- or changes it with the one-line SQL in HANDOFF.md.

-- The code. One row. Browsers cannot read it (RLS on, no policies, no grants).
create table if not exists public.repair_payout_code (
  id         int primary key default 1 check (id = 1),
  code_hash  text,
  updated_at timestamptz not null default now()
);
alter table public.repair_payout_code add column if not exists code_hash text;
alter table public.repair_payout_code add column if not exists updated_at timestamptz not null default now();
insert into public.repair_payout_code (id) values (1) on conflict (id) do nothing;
alter table public.repair_payout_code enable row level security;
revoke all on table public.repair_payout_code from public, anon, authenticated;

-- Wrong-code attempts, so the code cannot be guessed from the portal.
create table if not exists public.repair_payout_attempts (
  id      bigserial primary key,
  user_id uuid,
  ok      boolean not null,
  at      timestamptz not null default now()
);
create index if not exists repair_payout_attempts_user_idx on public.repair_payout_attempts (user_id, at desc);
alter table public.repair_payout_attempts enable row level security;
revoke all on table public.repair_payout_attempts from public, anon, authenticated;

-- What PBG has paid Scott for repairs collected at the shop.
-- Readable by the owner and Restored Rarity. No insert, update, or delete grant.
create table if not exists public.repair_payouts (
  id          uuid primary key default gen_random_uuid(),
  paid_on     date not null,
  amount      numeric(10,2) not null check (amount > 0),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by  text
);
alter table public.repair_payouts add column if not exists note text;
alter table public.repair_payouts add column if not exists created_by text;
alter table public.repair_payouts add column if not exists created_at timestamptz not null default now();
alter table public.repair_payouts add column if not exists updated_at timestamptz;
alter table public.repair_payouts add column if not exists updated_by text;
alter table public.repair_payouts enable row level security;
drop policy if exists repair_payouts_read on public.repair_payouts;
create policy repair_payouts_read on public.repair_payouts for select to authenticated
  using (coalesce(public.staff_role(), '') in ('owner','partner'));
revoke all on table public.repair_payouts from public, anon, authenticated;
grant select on table public.repair_payouts to authenticated;

-- Direct edits (the API, the table editor, a mistaken policy) are refused
-- unless the RPC below has just checked Scott's code in this transaction.
create or replace function public.repair_payouts_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('pbg.repair_payout_write', true), '') is distinct from 'on' then
    raise exception 'Repair payouts can only be changed with Scott''s code.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists repair_payouts_guard on public.repair_payouts;
create trigger repair_payouts_guard before insert or update or delete on public.repair_payouts
  for each row execute function public.repair_payouts_guard();
revoke all on function public.repair_payouts_guard() from public, anon, authenticated;

-- Checks the code. Not granted to the browser; the RPCs below call it.
create or replace function public.repair_payout_assert_code(p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare h text; uid uuid := auth.uid(); fails int;
begin
  if coalesce(public.staff_role(), '') not in ('owner','partner') then
    raise exception 'Only an owner or Restored Rarity can change repair payouts, and only with Scott''s code.';
  end if;
  select count(*) into fails from public.repair_payout_attempts
   where user_id = uid and ok = false and at > now() - interval '15 minutes';
  if fails >= 5 then
    raise exception 'Too many wrong repair payout codes. Wait 15 minutes and try again.';
  end if;
  select code_hash into h from public.repair_payout_code where id = 1;
  if h is null or h = '' then
    raise exception 'The repair payout code is not set yet. Scott sets it with the one-line SQL in HANDOFF.md.';
  end if;
  if p_code is null or length(btrim(p_code)) = 0 or h is distinct from crypt(p_code, h) then
    insert into public.repair_payout_attempts (user_id, ok) values (uid, false);
    raise exception 'That repair payout code is not right.';
  end if;
  insert into public.repair_payout_attempts (user_id, ok) values (uid, true);
end $$;
revoke all on function public.repair_payout_assert_code(text) from public, anon, authenticated;

-- Confirms the code before the portal shows the entry form. Does not write a payout.
create or replace function public.repair_payout_unlock(p_code text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.repair_payout_assert_code(p_code);
  return true;
end $$;
revoke all on function public.repair_payout_unlock(text) from public, anon;
grant execute on function public.repair_payout_unlock(text) to authenticated;

-- Repairs collected at PBG, payouts recorded, and what is still owed.
-- This is the repair total. It is not added into Restored Rarity's service share.
create or replace function public.repair_payout_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare due numeric; paid numeric;
begin
  if coalesce(public.staff_role(), '') not in ('owner','partner') then
    raise exception 'Only owners and Restored Rarity can see repair payouts';
  end if;
  select coalesce(sum(repair_paid), 0) into due from public.orders;
  select coalesce(sum(amount), 0) into paid from public.repair_payouts;
  return jsonb_build_object('repairs_due', due, 'payouts_recorded', paid, 'still_owed', due - paid);
end $$;
revoke all on function public.repair_payout_summary() from public, anon;
grant execute on function public.repair_payout_summary() to authenticated;

create or replace function public.repair_payout_add(p_code text, p_amount numeric, p_paid_on date, p_note text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; who text;
begin
  perform public.repair_payout_assert_code(p_code);
  if p_amount is null or round(p_amount, 2) <= 0 then raise exception 'Enter an amount greater than zero.'; end if;
  if p_paid_on is null then raise exception 'Enter the date PBG paid Scott.'; end if;
  if p_paid_on > (current_date + 1) then raise exception 'That date is in the future.'; end if;
  perform set_config('pbg.repair_payout_write', 'on', true);
  select name into who from public.staff where user_id = auth.uid();
  insert into public.repair_payouts (paid_on, amount, note, created_by)
  values (p_paid_on, round(p_amount, 2), nullif(left(btrim(coalesce(p_note, '')), 500), ''), who)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.repair_payout_add(text, numeric, date, text) from public, anon;
grant execute on function public.repair_payout_add(text, numeric, date, text) to authenticated;

create or replace function public.repair_payout_update(p_code text, p_id uuid, p_amount numeric, p_paid_on date, p_note text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare who text;
begin
  perform public.repair_payout_assert_code(p_code);
  if p_amount is null or round(p_amount, 2) <= 0 then raise exception 'Enter an amount greater than zero.'; end if;
  if p_paid_on is null then raise exception 'Enter the date PBG paid Scott.'; end if;
  if p_paid_on > (current_date + 1) then raise exception 'That date is in the future.'; end if;
  if not exists (select 1 from public.repair_payouts where id = p_id) then
    raise exception 'That payout was not found.';
  end if;
  perform set_config('pbg.repair_payout_write', 'on', true);
  select name into who from public.staff where user_id = auth.uid();
  update public.repair_payouts
     set paid_on = p_paid_on, amount = round(p_amount, 2),
         note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
         updated_at = now(), updated_by = who
   where id = p_id;
end $$;
revoke all on function public.repair_payout_update(text, uuid, numeric, date, text) from public, anon;
grant execute on function public.repair_payout_update(text, uuid, numeric, date, text) to authenticated;

create or replace function public.repair_payout_delete(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.repair_payout_assert_code(p_code);
  perform set_config('pbg.repair_payout_write', 'on', true);
  delete from public.repair_payouts where id = p_id;
  if not found then raise exception 'That payout was not found.'; end if;
end $$;
revoke all on function public.repair_payout_delete(text, uuid) from public, anon;
grant execute on function public.repair_payout_delete(text, uuid) to authenticated;
