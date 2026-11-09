/* PBG settings shared by the iPad app, staff portal and customer status page.
   Fill these in after creating the Supabase project (see SETUP.md).
   Leave supabaseUrl empty to run in demo mode with sample data. */
window.PBG_CONFIG = {
  supabaseUrl: "",          // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",      // Project Settings > API > anon public key
  statusUrl: "https://pbgcardshtx.com/status.html",  // public customer status page
  staffUrl: "https://pbgcardshtx.com/staff/",         // staff portal (linked from the iPad staff menu)

  // Pickup and unclaimed-card policy (must match the terms customers sign on the iPad).
  pickup: {
    freeDays: 30,            // free storage after the "Ready for pickup" notice
    feePerCardPerDay: 1,     // holding fee from day 31
    finalNoticeDay: 60,      // send the final notice (text/email + certified mail) on this day
    noticePeriodDays: 30     // pickup deadline in the final notice is at least this many days after it is sent
  },

  // Repairs dropped off at PBG go straight to Restored Rarity's website backend.
  // These are the same public values restoredraritytcg.com uses (portal/config.js and SUBMIT_ENDPOINT).
  // Nothing is sent while PBG is in demo mode.
  restoredRarity: {
    supabaseUrl: "https://bcozwalfszzuecjjqgam.supabase.co",
    anonKey: "sb_publishable_b2ZuOakWdzFaIJP3_jfLzg_VXePqruz",
    bucket: "portal",
    appsScriptUrl: "https://script.google.com/macros/s/AKfycbyB3lWxsrKg0hfSh4YvHG319jyenpPE1uljsiW1AcrQ328kDO6npH9mncOkellCYJVM/exec",
    portalUrl: "https://restoredraritytcg.com/portal/view.html",
    submitUrl: "https://restoredraritytcg.com/#submit",   // home-screen button on the iPad: Restored Rarity's own submission form
    referralCode: ""          // optional: a Restored Rarity referral code to tag PBG drop-offs
  }
};
