# PBG Cards & Collectibles HTX

Live at **https://pbgcardshtx.com**. Website, customer order tracking, staff portal and shop iPad intake app for PBG Cards & Collectibles HTX (25170 I-45 N, Unit 9, Spring, TX 77386).

| Path | What it is |
|---|---|
| `/` | Public website |
| `/status.html` | Customer's private order status page (linked from the QR code on their receipt) |
| `/staff/` | Staff portal: orders, grading stages, pickup clock, payouts |
| `/intake/` | iPad intake app (Add to Home Screen in Safari) |
| `pbg-config.js` | The one settings file: Supabase URL/key, site URLs, pickup policy, Restored Rarity link |
| `supabase/` | Database schema and the email function (not served) |

Runs in demo mode with sample orders until `pbg-config.js` has a Supabase URL. Full setup steps are in [SETUP.md](SETUP.md).

When you change files in `intake/`, bump `VERSION` in `intake/sw.js` so the iPad picks up the update.
