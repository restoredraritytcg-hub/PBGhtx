-- PBG update 2026-11-16: owners can delete an order from the staff portal. Safe to run more than once.

-- A short record of every deleted order (who, when, why, and a copy of the order), so a delete can be traced.
create table if not exists public.deleted_orders (
  id          bigint generated always as identity primary key,
  order_id    uuid not null,
  ticket      text,
  customer    text,
  reason      text,
  deleted_by  text,
  deleted_at  timestamptz not null default now(),
  snapshot    jsonb
);
alter table public.deleted_orders enable row level security;
drop policy if exists deleted_orders_owner on public.deleted_orders;
create policy deleted_orders_owner on public.deleted_orders for select to authenticated using (public.staff_role() = 'owner');

create or replace function public.delete_order(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; who text;
begin
  if coalesce(public.staff_role(), '') <> 'owner' then raise exception 'Only an owner can delete orders.'; end if;
  select * into o from public.orders where id = p_order;
  if not found then raise exception 'Order not found.'; end if;
  select name into who from public.staff where user_id = auth.uid();
  insert into public.deleted_orders (order_id, ticket, customer, reason, deleted_by, snapshot)
  values (o.id, o.ticket, trim(coalesce(o.customer_first, '') || ' ' || coalesce(o.customer_last, '')), nullif(trim(p_reason), ''), who,
          to_jsonb(o) - 'terms_text' || jsonb_build_object('cards', (select coalesce(jsonb_agg(to_jsonb(c) - 'front_path' - 'back_path'), '[]'::jsonb) from public.cards c where c.order_id = o.id)));
  delete from public.orders where id = p_order;   -- cards, history and email log are removed with it
end $$;
revoke all on function public.delete_order(uuid, text) from public, anon;
grant execute on function public.delete_order(uuid, text) to authenticated;

-- Owners can remove the order's photos and signature files
drop policy if exists "pbg files delete" on storage.objects;
create policy "pbg files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('card-photos','signatures') and public.staff_role() = 'owner');
