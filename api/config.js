// ============================================================
// GET /api/config  →  returns a tiny JS file that sets the
// public config on `window` from Vercel env vars:
//   SUPABASE_URL        (your project URL)
//   SUPABASE_ANON_KEY   (the public anon / publishable key)
//   ALLOWED_EMAILS      (comma-separated emails allowed to sign in;
//                        empty = anyone with a valid code can sign in)
//
// Loaded via <script src="/api/config"></script> in the <head>
// BEFORE auth.js / sync.js / topbar.js. If the env vars aren't set
// (or the site is opened as a static file with no server), it sets
// empty strings and sync stays local-only.
//
// These are all PUBLIC values (they ship to the browser anyway), so
// it's fine to expose them — this just lets you configure the app
// with env vars instead of editing files. The Supabase ANON key and
// the email allowlist are not secrets; the service_role key and the
// WHOOP/GCAL secrets are NEVER sent here.
// ============================================================
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';
  const allowed = process.env.ALLOWED_EMAILS || '';
  const whoopId = process.env.WHOOP_CLIENT_ID || '';   // public OAuth client id
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(
    'window.DASH_SUPABASE_URL=' + JSON.stringify(url) + ';' +
    'window.DASH_SUPABASE_KEY=' + JSON.stringify(key) + ';' +
    'window.DASH_ALLOWED_EMAILS=' + JSON.stringify(allowed) + ';' +
    'window.DASH_WHOOP_CLIENT_ID=' + JSON.stringify(whoopId) + ';'
  );
}
