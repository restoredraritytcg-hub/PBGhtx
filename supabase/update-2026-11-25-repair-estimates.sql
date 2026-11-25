-- PBG update 2026-11-25: collect Restored Rarity repair estimates at PBG.
-- Safe to re-run. Does not contain a code or any secret.
--
-- Run this in the PBG Supabase SQL editor after
-- update-2026-11-19-repair-payouts.sql.
--
-- Amount owed for a repair card:
--   * repair_quote when one is already set (a quote typed earlier, or an
--     over-$3,000 custom quote)
--   * otherwise cards.repair_estimate
--   * otherwise the "est. $X" text in repair_note
-- That amount is owed from check-in, not only after repair_paid.
-- repair_paid stays the collected figure. Repairs are not added into rr_share.
-- Sales tax is not applied to the repair amount.

alter table public.cards add column if not exists repair_estimate numeric(10,2);
alter table public.orders add column if not exists repair_included numeric(10,2);

comment on column public.cards.repair_estimate is
  'Check-in estimate: Restored Rarity price plus value surcharge, then 10% off. Not the amount when repair_quote is already set.';
comment on column public.orders.repair_included is
  'Repair dollars already folded into subtotal and total. Null means the ticket total does not include them yet.';

update public.cards
   set repair_estimate = round((regexp_match(repair_note, 'est\. \$([0-9]+(?:\.[0-9]+)?)'))[1]::numeric, 2)
 where repair
   and repair_estimate is null
   and repair_note ~ 'est\. \$[0-9]';

-- Existing quote wins over the estimate. Used by the payout functions below.
create or replace function public.card_repair_owed(p_repair boolean, p_estimate numeric, p_note text, p_quote numeric)
returns numeric language sql immutable set search_path = public as $$
  select case
    when coalesce(p_repair, false) is not true then 0
    when p_quote is not null and p_quote > 0 then round(p_quote, 2)
    when p_estimate is not null then round(p_estimate, 2)
    when coalesce(p_note, '') ~ 'est\. \$[0-9]' then round((regexp_match(p_note, 'est\. \$([0-9]+(?:\.[0-9]+)?)'))[1]::numeric, 2)
    else 0
  end
$$;
revoke all on function public.card_repair_owed(boolean, numeric, text, numeric) from public, anon, authenticated;

-- Fold that amount into ticket totals once. Does not change tax.
-- Orders saved after this column exists set repair_included themselves and are skipped.
with owed as (
  select c.order_id,
         coalesce(sum(public.card_repair_owed(c.repair, c.repair_estimate, c.repair_note, c.repair_quote)), 0) as amt
    from public.cards c
   group by c.order_id
)
update public.orders o
   set subtotal = round(coalesce(o.subtotal, 0) + owed.amt, 2),
       total = round(coalesce(o.total, 0) + owed.amt, 2),
       repair_included = owed.amt
  from owed
 where o.id = owed.order_id
   and o.repair_included is null
   and owed.amt <> 0;

-- Customer status page reads the estimate, the note, and whether the total already includes repairs.
create or replace function public.get_order_status(p_token uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ticket', o.ticket, 'first_name', o.customer_first, 'created_at', o.created_at,
    'grader', o.grader, 'tier', o.tier, 'has_prep', o.has_prep, 'current_stage', o.current_stage,
    'total', o.total, 'payment_when', o.payment_when, 'return_tracking', o.return_tracking,
    'auction_house', o.auction_house, 'auction_mode', o.auction_mode, 'terms_version', o.terms_version,
    'repair_included', o.repair_included,
    'cards', coalesce((select json_agg(json_build_object(
        'position', c.position, 'name', c.name, 'year', c.year, 'set_name', c.set_name, 'card_number', c.card_number,
        'variant', c.variant, 'category', c.category, 'clean', c.clean, 'eval', c.eval, 'repair', c.repair, 'gem', c.gem, 'gem_fee', c.gem_fee,
        'front_path', c.front_path, 'eval_result', c.eval_result, 'repair_quote', c.repair_quote,
        'repair_estimate', c.repair_estimate, 'repair_note', c.repair_note,
        'grade', c.grade, 'cert_number', c.cert_number, 'card_status', c.card_status,
        'hammer_price', c.hammer_price, 'auction_lot_url', c.auction_lot_url) order by c.position)
      from public.cards c where c.order_id = o.id), '[]'::json),
    'events', coalesce((select json_agg(json_build_object('stage', e.stage, 'note', e.note, 'at', e.created_at) order by e.created_at)
      from public.stage_events e where e.order_id = o.id and e.visible_to_customer), '[]'::json)
  )
  from public.orders o where o.public_token = p_token
$$;
grant execute on function public.get_order_status(uuid) to anon, authenticated;

drop function if exists public.payout_report(date, date);
create function public.payout_report(p_from date, p_to date)
returns table (ticket text, created_at timestamptz, grader text, tier text, current_stage text, graded_count int, eval_count int,
               prep_count int, gem_count int, gem_fees numeric, mag_count int, mag_fees numeric, total numeric, tax numeric, grader_fees numeric,
               pbg_share numeric, rr_share numeric, repair_paid numeric, repair_paid_at timestamptz, repair_owed numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.staff_role(), '') not in ('owner','partner') then raise exception 'Only owners and the partner can see payouts'; end if;
  return query
    select o.ticket, o.created_at, o.grader, o.tier, o.current_stage, o.graded_count, o.eval_count, o.prep_count, o.gem_count, o.gem_fees, o.mag_count, o.mag_fees,
           o.total, o.tax, o.grader_fees, o.pbg_share, o.rr_share, o.repair_paid, o.repair_paid_at,
           (select coalesce(sum(public.card_repair_owed(c.repair, c.repair_estimate, c.repair_note, c.repair_quote)), 0)
              from public.cards c where c.order_id = o.id)
    from public.orders o
    where o.created_at >= p_from and o.created_at < (p_to + 1)
    order by o.created_at;
end $$;
grant execute on function public.payout_report(date, date) to authenticated;

-- repairs_due is owed from check-in. repairs_collected is orders.repair_paid.
create or replace function public.repair_payout_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare due numeric; collected numeric; paid numeric;
begin
  if coalesce(public.staff_role(), '') not in ('owner','partner') then
    raise exception 'Only owners and Restored Rarity can see repair payouts';
  end if;
  select coalesce(sum(public.card_repair_owed(c.repair, c.repair_estimate, c.repair_note, c.repair_quote)), 0)
    into due from public.cards c;
  select coalesce(sum(repair_paid), 0) into collected from public.orders;
  select coalesce(sum(amount), 0) into paid from public.repair_payouts;
  return jsonb_build_object('repairs_due', due, 'repairs_collected', collected, 'payouts_recorded', paid, 'still_owed', due - paid);
end $$;
revoke all on function public.repair_payout_summary() from public, anon;
grant execute on function public.repair_payout_summary() to authenticated;
