-- PBG update 2026-11-13: save the signed terms on every order. Safe to run more than once.
alter table public.orders add column if not exists terms_version text;
alter table public.orders add column if not exists terms_text    text;
alter table public.orders add column if not exists signed_at     timestamptz;
alter table public.orders add column if not exists ownership_ack boolean not null default false;

create or replace function public.get_order_status(p_token uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ticket', o.ticket, 'first_name', o.customer_first, 'created_at', o.created_at,
    'grader', o.grader, 'tier', o.tier, 'has_prep', o.has_prep, 'current_stage', o.current_stage,
    'total', o.total, 'payment_when', o.payment_when, 'return_tracking', o.return_tracking,
    'auction_house', o.auction_house, 'auction_mode', o.auction_mode, 'terms_version', o.terms_version,
    'cards', coalesce((select json_agg(json_build_object(
        'position', c.position, 'name', c.name, 'year', c.year, 'set_name', c.set_name, 'card_number', c.card_number,
        'variant', c.variant, 'category', c.category, 'clean', c.clean, 'eval', c.eval, 'repair', c.repair, 'gem', c.gem, 'gem_fee', c.gem_fee,
        'front_path', c.front_path, 'eval_result', c.eval_result, 'repair_quote', c.repair_quote,
        'grade', c.grade, 'cert_number', c.cert_number, 'card_status', c.card_status,
        'hammer_price', c.hammer_price, 'auction_lot_url', c.auction_lot_url) order by c.position)
      from public.cards c where c.order_id = o.id), '[]'::json),
    'events', coalesce((select json_agg(json_build_object('stage', e.stage, 'note', e.note, 'at', e.created_at) order by e.created_at)
      from public.stage_events e where e.order_id = o.id and e.visible_to_customer), '[]'::json)
  )
  from public.orders o where o.public_token = p_token
$$;
grant execute on function public.get_order_status(uuid) to anon, authenticated;
