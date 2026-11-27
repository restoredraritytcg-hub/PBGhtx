# HANDOFF: repair estimates collected at PBG

The rest of the shop setup (Supabase, iPad, email, website) is in [SETUP.md](SETUP.md). This note is the part Scott runs himself.

## 1. Run the database update

In the PBG Supabase project: **SQL Editor > New query**, paste `supabase/update-2026-11-25-repair-estimates.sql`, and click **Run**. It is safe to run again. It does not contain a code.

Run it after `supabase/update-2026-11-19-repair-payouts.sql` (and the two 2026-11-16 files before that, if those were never run). The new file adds `cards.repair_estimate`, fills it from existing notes that say `est. $X`, and folds each card's repair amount into that order's subtotal and total once.

Until this has been run, the customer status page for an estimate-only order still shows the old ticket total, and the Repair payouts panel still counts only money already recorded as collected. The staff order page already adds the amount (an earlier quote, or the estimate parsed from the note).

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

PBG collects the repair from the customer at payment (drop-off or pickup), as part of the ticket total. The amount for each repair card is:

- **Quoted earlier:** `cards.repair_quote` when a quote was already typed on that card. That amount is kept. Staff cannot change it. New cards do not get a typed quote.
- **Otherwise the check-in estimate:** `cards.repair_estimate`, or `est. $X` in `cards.repair_note` until the column is filled. The estimate is Restored Rarity's Base ($35) or Major ($50) repair, plus the value surcharge (0% up to $250, 10% for $251–$1,500, 12% for $1,501–$3,000, rounded up to the dollar), then 10% off. Cards over $3,000 have no estimate.
- **Over $3,000 only:** staff can enter **RR custom quote (cards over $3,000)**. That saved quote is the amount.

**Repairs owed** is that amount, from check-in, not only after someone records `orders.repair_paid`. **Repairs collected** is `orders.repair_paid`, the collected figure. The "Customer paid the repairs at PBG" box starts at the amount owed.

**Owed to Restored Rarity** on an order is `orders.rr_share` plus the repair amounts. Repairs are not inside `rr_share` (the grading, evaluation, prep and gem split). The payout screens add them on top, from check-in. **Still owed** on Repair payouts = repairs owed minus payouts Scott has recorded.

Sales tax is not applied to repairs. [to confirm]

**Still owed** on the service-share log ("Paid to Restored Rarity") is the unpaid service share plus repairs still unpaid. Repair payouts stay in the Repair payouts log. If a service payment already logged there was partly for repairs, delete it (owner) and record the repair part under Repair payouts.

## 4. Restored Rarity orders from the iPad

When a PBG check-in has prep, a pre-grade evaluation, or a repair, the iPad opens **one** Restored Rarity order for those cards:

- Customer name, email and phone
- Marked **From PBG**
- PBG ticket stored on the Restored Rarity order (service line, private notes, and the sheet address)
- Restored Rarity order number stored on the PBG order (`orders.rr_code`)

The staff portal shows both: "Restored Rarity order RR-… is tied to PBG ticket PBG-…". A retry does not open a second Restored Rarity order. Orders that were already sent before this change are left as they are.

Prep and pre-grade evaluation are paid at PBG. The Restored Rarity order is the work ticket. The repair estimate is also collected at PBG at payment. Adjust later if Restored Rarity's final price differs. A card over $3,000 waits for the custom quote.

## 10Point footer credit

The public site footer must keep a small “Built by 10Point Studios” credit linking to https://10pointstudios.com (with the existing utm tags). Do not remove it. Compass &amp; Oak sites are the exception and must not mention 10Point.
