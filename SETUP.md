# PBG Cards & Collectibles HTX: website, iPad app, order tracking and email

## What's in this repo

| Folder | What it is | Where it goes |
|---|---|---|
| repo root | Public website (`index.html`), customer status page (`status.html`), staff portal (`staff/`), shared `pbg-config.js` / `pbg-api.js` | GitHub Pages |
| `intake/` | The shop iPad app (installable, works offline). Uses the root `pbg-config.js` | Same site, at `/intake/` |
| `supabase/schema.sql` | Database, security rules, grading stages, email triggers | Run once in Supabase |
| `supabase/functions/pbg-notify/` | Email automation | Deployed to Supabase |

Everything runs in **demo mode** with sample orders until you fill in `pbg-config.js`. The Apps Script / Google Sheets backend from the first version is retired.

## How it works day to day

1. **Customer fills out the iPad**: info, grading company and level, cards with photos, cleaning / pre-grade evaluation / repair, payment, terms and signature.
2. **Customer hands the iPad to an employee.** The employee checks the cards against the list (count, photos, values, payment) and enters **their own 4-digit code** to accept the cards. Their name is saved on the order.
3. The customer gets a ticket number and a **QR code** to their private status page (also printed on the receipt and emailed).
4. Staff (and Restored Rarity) use the **staff portal** to move orders through each grading company's stages, enter evaluation results, grades and cert numbers. Several orders can move at once, such as a whole PSA batch.
5. **Emails go out automatically**: receipt at check-in, updates at key stages, "ready for pickup". PBG gets a copy of every new order, and Restored Rarity gets every order with prep work.

## 1. Create the Supabase project

1. Sign in at supabase.com and create a project named "PBG" (the free plan is fine).
2. **SQL Editor > New query**: paste all of `supabase/schema.sql` and click **Run**.
3. **Authentication > Sign In / Providers > Email**: turn **off** "Allow new users to sign up", so only accounts you create can sign in.
4. **Authentication > Users > Add user** (with "Auto confirm" on). Create:
   - `ipad@pbgcardshtx.com`: the account the shop iPad connects with
   - your own account, plus any PBG manager who should use the staff portal
   - a Restored Rarity account for the partner view
5. Copy each user's ID from the Users list, then in the SQL Editor run:

```sql
insert into public.staff (user_id, name, role) values
  ('PASTE-IPAD-USER-ID',    'Shop iPad',        'staff'),
  ('PASTE-YOUR-USER-ID',    'Jeff',             'owner'),
  ('PASTE-RR-USER-ID',      'Restored Rarity',  'partner');
```

Roles: `owner` can do everything, including editing stage lists. `staff` handles all orders. `partner` (Restored Rarity) sees only orders with prep work, can set "With Restored Rarity" and "Prep complete", and can enter evaluation results and repair quotes. Partners never see customer phone numbers or totals.

## 2. Fill in the config

**Project Settings > API**: copy the Project URL and the `anon` public key into `pbg-config.js` at the repo root (the website, staff portal and iPad app all use this one file):

```js
window.PBG_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJ...",
  statusUrl: "https://pbgcardshtx.com/status.html",
  staffUrl: "https://pbgcardshtx.com/staff/"
};
```

The anon key is meant to be public. The security rules in `schema.sql` decide what each account can see.

## 3. Host the site and the iPad app

- This repo is served by GitHub Pages (Settings > Pages > Deploy from a branch > `main` / root). The domain is `https://pbgcardshtx.com` (set by the `CNAME` file in this repo).
  - Website: `/`  ·  Customer status page: `/status.html`  ·  Staff portal: `/staff/` (not linked from the public site)  ·  iPad app: `/intake/`
- **Domain DNS** (at the registrar for pbgcardshtx.com): four `A` records for `@` pointing to 185.199.108.153, 185.199.109.153, 185.199.110.153 and 185.199.111.153, and a `CNAME` for `www` pointing to `restoredraritytcg-hub.github.io`. Then in Settings > Pages confirm the custom domain shows `pbgcardshtx.com` and tick "Enforce HTTPS" once the certificate is ready.
- **iPad**: open `/intake/` in Safari, Share > Add to Home Screen. It must be served over https to install and work offline.
- When you change app files later, bump `VERSION` at the top of `intake/sw.js` so the iPad picks up the update.

## 4. Turn on email (Resend + Supabase Edge Function)

1. Create a free account at resend.com. **Domains > Add domain**: add PBG's domain and put the DNS records it shows into the domain's DNS (Namecheap > Advanced DNS). Wait for "Verified".
2. **API Keys > Create**: copy the key.
3. Install the Supabase CLI, then from this package's folder:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  PBG_NOTIFY_SECRET=$(openssl rand -hex 24) \
  FROM_EMAIL="PBG Cards & Collectibles <orders@pbgcardshtx.com>" \
  REPLY_TO=<shop gmail> \
  SHOP_EMAIL=<shop gmail> \
  PARTNER_EMAIL=restoredraritytcg@gmail.com \
  STATUS_URL=https://pbgcardshtx.com/status.html
supabase functions deploy pbg-notify --no-verify-jwt
```

Generate the secret first (`openssl rand -hex 24`), save it, and use that same value here and in the next step. Replace the `$(openssl ...)` part above with it.

4. In the SQL Editor, point the database at the function:

```sql
insert into public.app_settings values ('notify_url', 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/pbg-notify')
  on conflict (key) do update set value = excluded.value;
insert into public.app_settings values ('notify_secret', 'THE-SAME-SECRET')
  on conflict (key) do update set value = excluded.value;
```

5. Test it: submit an order on the iPad with your own email. Check **Table Editor > email_log** for `sent`, `failed` (with the error) or nothing (meaning the trigger didn't fire; recheck step 4).

**Which stages email the customer**: every stage whose `notify_customer` is true in the `grader_stages` table. Short in-between steps (PSA Order prep, QA 1/2, CGC Received/QC, Beckett Invoiced, SGC Received/QC) start switched off. Flip any row in the Table Editor. Staff can also turn the email on or off for a single update in the portal.

## 5. Set up the shop iPad

1. Open the iPad app URL in Safari, tap **Share > Add to Home Screen**, and open it from the new icon.
2. Tap the gear and enter the manager PIN (**1234** to start).
3. **Settings**:
   - Set the real prices: partner rates for cleaning and evaluation, and the grading levels with their max declared values. The "Prices not set" badge disappears after you save.
   - **Employees**: add each employee's name and a 4-digit code. Codes are stored scrambled on the iPad. Until at least one employee exists, the manager PIN accepts cards.
   - **Connect this iPad**: sign in once with the `ipad@` account. It stays connected.
   - Review the terms and change the manager PIN.
4. Lock the iPad to the app with **Settings > Accessibility > Guided Access** (triple-click to start).

If the internet drops, orders are saved on the iPad and upload automatically when it's back. "Waiting to upload" shows in the header.

## 6. Pricing and the profit split

**Grading**: the customer pays the grading company's fee plus **$20 PBG handling** per card. Fees in the app were checked on Nov 9, 2026:

| Company | Open | Paused (greyed out on the iPad) |
|---|---|---|
| PSA | Value $39.99, Standard $59.99, Priority $79.99, Express $199, Super Express $349, Premier $599 | Value Bulk $24.99, Value Plus $49.99, Value Max $64.99 |
| CGC | Bulk $17 (25-card min), Economy $20, Standard $55, Express $100, WalkThrough $300 | None |
| Beckett | Express $79.95 | Base $14.95 / $17.95 with subgrades, Standard $34.95, Priority $124.95 |
| TAG | Value $29.95 (10-card min), Base $39.95 (5-card min), Standard $59.95, Priority $79.95, Express $149.95, Premier $299.95 | None |

Grading companies change prices and pause levels often. Check monthly and update under **Staff > Settings > Grading companies**: edit the company fee and tick or untick **Open**. Minimums (CGC Bulk, TAG Value/Base) apply to PBG's batch to the grader, not to each customer.

**Add-ons (Restored Rarity)**: Full evaluation with magnification **$17**, Prep **$7** per card.

**Where the rules live**: prices, add-ons, gem tiers, the split and the grading company list are stored in Supabase (`pricing` table). Every iPad loads them on start and keeps a copy for offline use. Saving under **Staff > Settings** on any iPad updates them for all iPads. The database calculates PBG's and Restored Rarity's shares itself when an order comes in, so the split can't drift; changes only affect new orders.

**Split** (shown under **Payouts** in the staff portal):

| | PBG | Restored Rarity |
|---|---|---|
| Each graded card ($20 handling) | $12 | $8 |
| Full evaluation ($17) | $2 | $15 |
| Prep ($7) | $2 | $5 |
| Gem service, includes a magnetic case: $40 over $4,000, $60 over $6,000, $80 over $8,000, $100 over $10,000 | 70% ($28 / $42 / $56 / $70) | 30% ($12 / $18 / $24 / $30) |

Grading company fees are tracked separately as "owed to grading companies". Sales tax isn't part of the split. Owners and the Restored Rarity partner account can see Payouts; shop staff accounts can't.

## 7. Repairs go to Restored Rarity's website

PBG is an authorized drop-off location for Restored Rarity. When a card is marked **Repair by Restored Rarity** on the iPad (Base repair, Major repair or "Not sure"), the customer also agrees to Restored Rarity's Terms & Conditions, and after the employee accepts the cards the iPad sends the repair cards to restoredraritytcg.com the same way its own intake form does:

1. Restored Rarity portal (`intake_submit`), so the customer gets a Restored Rarity code and private link, with the card photos attached
2. Restored Rarity's Apps Script, so the card lands in the Restored Rarity sheet with a quote and Restored Rarity's usual confirmation and owner emails

The delivery method is "Hand delivered" with the address "Dropped off at PBG Cards & Collectibles HTX (PBG ticket ...)", and each card's notes include the PBG ticket. The Restored Rarity code is saved on the PBG order and shown in the staff portal. Repairs are quoted and billed by Restored Rarity directly, so they aren't part of PBG's totals or the split. If the internet is down, the iPad retries automatically without creating duplicates.

Settings are in `restoredRarity` inside `pbg-config.js` (the same public values the Restored Rarity site uses). Nothing is sent while PBG is in demo mode. Optional: set `referralCode` to a Restored Rarity referral code to tag PBG drop-offs.

## 8. Card-name suggestions

When "Pokémon" is picked on a card, typing a name or number (like "charizard 4/102") suggests matching cards. Picking one fills in the year, set and card number. The list is the same one used by restoredraritytcg.com, RipperDoc and PH Restoration Lab: about 21,000 English cards from TCGdex.

- The iPad loads it live from `https://restoredraritytcg.com/portal/cards.json`, which updates itself on the 1st and 15th. If that's unreachable, it uses the GitHub copy, then the `cards.json` bundled with the app (for offline use).
- Don't move, rename or change the format of `portal/cards.json` in the Restored Rarity repo without updating this app (`intake/cardsearch.js`).
- Sports and other TCG cards are typed in by hand. The list has Pokémon cards only.

## 9. Changing grading stages

Stages live in the `grader_stages` table. Each company has its own list:

- **PSA**: Arrived, Order prep, Research & ID, Grading, Assembly, QA check 1, QA check 2, Shipped
- **CGC**: Arrived, Received, Scheduled for grading, Grading/encapsulation/imaging, Quality control, Shipped
- **Beckett**: Arrived, Invoiced, Verification, Grading, Shipped
- **TAG**: Arrived, Received, Grading, Encapsulation & imaging, Quality check, Shipped
- **SGC** stages are also included in case PBG adds SGC later

Every order also gets PBG's own steps: Checked in, With Restored Rarity and Prep complete (only when there's prep work), On the way to the grader, Ready for pickup, and Picked up. To add a company, such as SGC on the iPad, add it under Staff > Settings; its stages are already in the table. Any company without its own rows uses a short generic list. Labels and the customer-facing description can be edited at any time.
