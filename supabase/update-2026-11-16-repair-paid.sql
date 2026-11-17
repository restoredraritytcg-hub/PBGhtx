-- PBG update 2026-11-16c: record repair payments PBG collects for Restored Rarity. Safe to run more than once.
alter table public.orders add column if not exists repair_paid        numeric(10,2);
alter table public.orders add column if not exists repair_paid_at     timestamptz;
alter table public.orders add column if not exists repair_paid_method text;

-- Payouts report now also returns repair money PBG collected (100% owed to Restored Rarity)
drop function if exists public.payout_report(date, date);
create function public.payout_report(p_from date, p_to date)
returns table (ticket text, created_at timestamptz, grader text, tier text, current_stage text, graded_count int, eval_count int,
               prep_count int, gem_count int, gem_fees numeric, mag_count int, mag_fees numeric, total numeric, tax numeric, grader_fees numeric,
               pbg_share numeric, rr_share numeric, repair_paid numeric, repair_paid_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.staff_role(), '') not in ('owner','partner') then raise exception 'Only owners and the partner can see payouts'; end if;
  return query
    select o.ticket, o.created_at, o.grader, o.tier, o.current_stage, o.graded_count, o.eval_count, o.prep_count, o.gem_count, o.gem_fees, o.mag_count, o.mag_fees,
           o.total, o.tax, o.grader_fees, o.pbg_share, o.rr_share, o.repair_paid, o.repair_paid_at
    from public.orders o
    where o.created_at >= p_from and o.created_at < (p_to + 1)
    order by o.created_at;
end $$;
grant execute on function public.payout_report(date, date) to authenticated;
