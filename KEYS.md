# 🔑 Keys, Links & Config — where everything goes

One page that tells you exactly where to put every value. Do these top to
bottom and you'll have a synced, deployed dashboard + iOS app.

> **✅ Author's project removed.** The original author's hardcoded Supabase
> project is **gone** from [`sync.js`](sync.js), [`topbar.js`](topbar.js), and
> [`gym.html`](gym.html) — they now read config only from your env via
> [`/api/config`](api/config.js). So you **must** set `SUPABASE_URL` +
> `SUPABASE_ANON_KEY` (Step 1) or sync + sign-in stay off (the app runs
> local-only and the login gate is skipped).
>
> **Local secrets:** copy [`.env.example`](.env.example) → `.env` and fill it in
> (`.env` is gitignored). `vercel dev` reads it locally; set the same names in
> Vercel for production. Full local walkthrough + SQL: [TESTING.md](TESTING.md).

---

## At a glance

| Value | Where it goes | Used by |
|---|---|---|
| **Supabase Project URL** | Vercel env `SUPABASE_URL` (+ `.env` locally) | all sync ([sync.js], [topbar.js], gym), sign-in |
| **Supabase anon / publishable key** | Vercel env `SUPABASE_ANON_KEY` (+ `.env`) | all sync, sign-in |
| **Allowed sign-in emails** | Vercel env `ALLOWED_EMAILS` (comma list) | [auth.js](auth.js) login gate |
| **Vercel deploy URL** | Swift `Config.swift` + WHOOP redirect URI | iOS app, WHOOP |
| **WHOOP Client ID** | `health.html` (`CLIENT_ID`) **and** Vercel env `WHOOP_CLIENT_ID` | Health page |
| **WHOOP Client Secret** | Vercel env `WHOOP_CLIENT_SECRET` (secret!) | `api/whoop-*` |
| **Google Calendar secret iCal URL** | Vercel env `GCAL_ICS_URL` | `api/calendar.js` |
| **Google Books** | — none needed (keyless) | Reading page |
| **Anthropic API key** | pasted in-app on the Nova tile (stored in your browser) | Nova |
| **Exercise database** | bundled at `data/exercises.json` — no key | Gym |

Everything marked "Vercel env" is set in **Vercel → your project → Settings →
Environment Variables**, then **redeploy**. The browser reads the public ones via
[`/api/config`](api/config.js) → `window.DASH_*`.

---

## 1. Supabase (cross-device sync) — **required**

1. Create a free project at **supabase.com**.
2. **Project Settings → API** → copy the **Project URL** and the **anon /
   publishable** key (starts with `sb_publishable_` or is labeled `anon`).
3. In **Vercel → Settings → Environment Variables** add:
   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_ANON_KEY` | your anon / publishable key |
4. In Supabase **SQL Editor**, run the SQL from [`SETUP.md`](SETUP.md) §2 (creates
   the `app_state` table + realtime + the `progress-photos` storage bucket).
5. **Redeploy** on Vercel.

> Only ever use the **anon** key in the browser. **Never** put the `service_role`
> key in these files or env vars.

**Sync keys per page** (each page mirrors its own `localStorage` to the
`app_state` table — no action needed, just FYI):

| Page | `app_state` row key | localStorage keys |
|---|---|---|
| Main | `goals` | `goals:*` |
| Health / Water | `health` | `stack:*`, `po_water_v1`, … |
| Gym | `po-coach` | `po_coach_v1`, `po_coach_*` |
| **Reading** (new) | `reading` | `reading:books`, `reading:logs` |
| **Projects** (new) | `projects` | `projects:plan` |
| **Calendar** (new) | `calendar` | `gcal:embed` |

---

## 1b. Email + password sign-in — **recommended**

The dashboard is gated by [`auth.js`](auth.js): email + password → you're in
(new emails auto-register). No emailed code/link, so it works inside the
home-screen / WebView app. Session persists across launches.

1. **Allowlist:** set `ALLOWED_EMAILS` (Vercel env + `.env`) to your email(s),
   comma-separated. Only these can sign in. (Blank = anyone — not recommended,
   since the data is single-tenant.)
2. **Supabase Dashboard → Authentication → Providers → Email:** enable Email and
   **turn OFF "Confirm email"** (so registering logs you in instantly).
3. **Lock the database to your email** with the RLS policy in
   [TESTING.md](TESTING.md) §0A (so the public anon key alone can't read your
   data without a valid session).

> The gate auto-disables if Supabase isn't configured, so you can't lock yourself
> out of an un-provisioned deploy. Sign out from **Main → ⚙ → Sign out**.

## 2. Vercel (hosting) — **required**

1. Push this repo to GitHub.
2. **vercel.com → Add New → Project → Import** your repo. Framework preset:
   **Other**. Root: `./`. Build/output: leave blank (it's static + `/api`).
3. Add the env vars from the other sections, then **Deploy**.
4. Copy your live URL, e.g. `https://your-dashboard.vercel.app`. You'll use it in:
   - **Swift** `ios/Dashboard/Config.swift` → `dashboardURL`
   - **WHOOP** redirect URI (Step 3)

---

## 3. WHOOP (optional — Health page recovery/sleep)

1. **developer.whoop.com** → create an app.
2. **Redirect URI** = `https://your-dashboard.vercel.app/api/whoop-callback`
   (use your real domain; add every domain you'll open the site from).
3. Put the **Client ID** in [`health.html`](health.html) (`const CLIENT_ID = '...'`).
4. Add Vercel env vars:
   | Variable | Value |
   |---|---|
   | `WHOOP_CLIENT_ID` | your WHOOP Client ID |
   | `WHOOP_CLIENT_SECRET` | your WHOOP Client Secret (**secret**) |
5. Redeploy → open Health → **Connect WHOOP**. The callback auto-detects the
   domain, so no `WHOOP_REDIRECT_URI` is needed.

---

## 4. Google Calendar (optional — read-only agenda)

**Recommended (native dark agenda):**
1. Google Calendar → **Settings** → pick your calendar → **Integrate calendar**.
2. Copy the **Secret address in iCal format** (ends in `.ics`).
3. Vercel env:
   | Variable | Value |
   |---|---|
   | `GCAL_ICS_URL` | that `.ics` URL (comma-separate multiple calendars) |
4. Redeploy → open the **Calendar** tab. [`api/calendar.js`](api/calendar.js) reads
   the feed server-side (URL stays private) and renders the agenda.

**Zero-setup alternative (embed):** on the Calendar page tap **⚙** and paste your
calendar **ID** (e.g. `you@gmail.com`, the calendar must be public) or a full
Google embed URL. No Vercel env needed; this preference syncs across devices.

---

## 5. Google Books (Reading page) — **nothing to do**

The Reading tracker calls the public Google Books API **without a key** to
auto-fill page counts. No setup. (If you ever hit rate limits from heavy use,
Google issues free API keys, but it's not wired up because personal use never
needs one.)

---

## 6. Nova (AI mentor) — optional

No repo key. On the **Nova** tile, paste **your own** Anthropic API key
(from console.anthropic.com). It's stored only in your browser and sent straight
to Anthropic.

---

## 7. iOS app

See [`ios/README.md`](ios/README.md). The only value you set there is your Vercel
URL in `Config.swift`.

---

## Quick checklist

- [ ] Supabase project created + SQL run
- [ ] `SUPABASE_URL` + `SUPABASE_ANON_KEY` in Vercel
- [ ] Deployed to Vercel, URL copied
- [ ] (opt) WHOOP: Client ID in `health.html` + 2 env vars + redirect URI
- [ ] (opt) Calendar: `GCAL_ICS_URL` in Vercel **or** embed via ⚙
- [ ] (opt) iOS: `dashboardURL` set in `Config.swift`
- [ ] Old `srajryooffirbroltjmg` fallback no longer in use (env vars override it)
