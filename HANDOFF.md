# HANDOFF: repair payouts and Restored Rarity orders

The rest of the shop setup (Supabase, iPad, email, website) is in [SETUP.md](SETUP.md). This note is the part Scott runs himself.

## 1. Run the database update

In the PBG Supabase project: **SQL Editor > New query**, paste `supabase/update-2026-11-19-repair-payouts.sql`, and click **Run**. It is safe to run again. It does not contain a code.

Until this has been run, the staff portal's Repair payouts panel says the database update is needed.

## 2. Set or change Scott's payout code

The code is not in this repo and it is not a staff PIN. Supabase stores only a bcrypt hash. Shop staff who use the portal can see the repair balance. They cannot add, change, or delete a payout unless this code is entered, and the database checks it.

In the SQL Editor, run this **one line**. Replace `PASTE-YOUR-CODE-HERE` with the code. If the code contains a single quote, type it twice (`'` becomes `''`). Use at least 8 characters, and do not reuse a staff PIN.

```sql
insert into public.repair_payout_code (id, code_hash) values (1, extensions.crypt('PASTE-YOUR-CODE-HERE', extensions.gen_salt('bf', 10))) on conflict (id) do update set code_hash = excluded.code_hash, updated_at = now();
```

Changing the code is the same line. The old code stops working immediately. Five wrong tries in 15 minutes locks that sign-in out for 15 minutes.

Payouts are entered in **Staff portal > Payouts > Repair payouts**. The table editor will refuse a direct edit. That is intentional: the code path is the only write path.

Demo mode (no Supabase URL) uses the code `demo-repairs`. That string is not the live code and does nothing once the portal is connected.

## 3. What the repair total means

**Repairs due** is the sum of repair payments recorded on PBG orders (`orders.repair_paid`). It is calculated in the database (`repair_payout_summary`) and shown on its own. It is not added to:

- customer grading / submission totals
- money owed to grading companies
- Restored Rarity's service share (graded cards, evaluations, prep, gem services)

**Still owed** = repairs due minus payouts Scott has recorded. The service-share log under it ("Paid to Restored Rarity") no longer includes repair collections. If a payment already logged there was partly for repairs, delete it (owner) and record the repair part under Repair payouts.

## 4. Restored Rarity orders from the iPad

When a PBG check-in has prep, a pre-grade evaluation, or a repair, the iPad opens **one** Restored Rarity order for those cards:

- Customer name, email and phone
- Marked **From PBG**
- PBG ticket stored on the Restored Rarity order (service line, private notes, and the sheet address)
- Restored Rarity order number stored on the PBG order (`orders.rr_code`)

The staff portal shows both: "Restored Rarity order RR-… is tied to PBG ticket PBG-…". A retry does not open a second Restored Rarity order. Orders that were already sent before this change are left as they are.

Prep and pre-grade evaluation are paid at PBG. The Restored Rarity order is the work ticket. Repairs are still quoted by Restored Rarity.
