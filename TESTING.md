# 🧪 Test locally before deploying to Vercel

Because the dashboard uses serverless functions (`/api/config`, `/api/calendar`,
`/api/whoop-*`) and Supabase, the right way to test is with **`vercel dev`**,
which runs those functions locally with your `.env`. Opening the `.html` files
directly (`file://`) will **not** run `/api/*`, so sign-in and sync won't work.

---

## 0. One-time: Supabase setup

### A) Run the SQL  (Supabase → SQL Editor → New query → Run)

```sql
-- 1) Sync table -------------------------------------------------
create table if not exists public.app_state (
  key        text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;

-- 2) Access policy — LOCK TO YOUR EMAIL (recommended) -----------
-- Replace the email with yours. Only this signed-in user can read/write.
drop policy if exists "anon full access app_state" on public.app_state;
drop policy if exists "owner full access app_state" on public.app_state;
create policy "owner full access app_state"
  on public.app_state for all
  to authenticated
  using      ( lower(auth.email()) = lower('muhammadshaaf@yahoo.com') )
  with check ( lower(auth.email()) = lower('muhammadshaaf@yahoo.com') );

-- 3) Realtime (instant cross-device updates) --------------------
-- Safe to ignore the error if it says the table is already a member.
alter publication supabase_realtime add table public.app_state;

-- 4) Progress-photo storage (gym) ------------------------------
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

drop policy if exists "anon manage progress-photos" on storage.objects;
drop policy if exists "auth manage progress-photos" on storage.objects;
create policy "auth manage progress-photos"
  on storage.objects for all
  to authenticated
  using      ( bucket_id = 'progress-photos' )
  with check ( bucket_id = 'progress-photos' );
```

> **Want to allow more than one person?** Use a list instead:
> `using ( lower(auth.email()) = any (array['you@x.com','partner@y.com']) )`
> (and the same in `with check`). Keep `ALLOWED_EMAILS` in `.env` in sync.

> **Just want it working fast, security later?** Swap policy #2 for
> `to authenticated using (true) with check (true)` — any signed-in user gets in.
> Tighten to the email version before you rely on it.

### B) Configure email + password sign-in

The dashboard uses **email + password** (no emailed code/link — that flow can't
complete inside a home-screen / WebView app). In the Supabase Dashboard:

1. **Authentication → Providers → Email** → make sure **Email** is enabled.
2. **TURN OFF "Confirm email."** Required so registering a new email logs you in
   instantly. (With it ON, sign-up creates the user but no session until they
   click a confirmation link — the same broken-link problem.)
3. **Migrating from the old code flow?** If you already created your account via
   the magic-link/OTP flow, it has **no password**. Delete it once under
   **Authentication → Users**, then sign in with your email + a password (≥6
   chars) to re-register. Your data is keyed by app name + locked by email in
   RLS, so re-registering the same email keeps everything.

---

## 1. Create your local `.env`

```bash
cp .env.example .env
```

Fill in at least `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ALLOWED_EMAILS`
(your email). Add WHOOP / `GCAL_ICS_URL` only if you're testing those.

## 2. Run it locally

```bash
npm i -g vercel        # once
vercel dev             # first run will ask to link/create a project — that's fine
```

Open the URL it prints (usually **http://localhost:3000**).

## 3. What to check

- [ ] **Sign-in:** you see the lock screen → enter your email → you get an
      8-digit code by email → entering it logs you in. A non-allow-listed email
      is rejected.
- [ ] **Each page loads:** Main, Projects, Fitness, Reading, Health, Calendar,
      Water, Finance, Caffeine, Nova.
- [ ] **Reading:** add a book by title → page count auto-fills → log pages/minutes.
- [ ] **Fitness:** your push/pull/legs exercises are there; the exercise-DB
      search finds movements; add a cardio session.
- [ ] **Projects:** add a goal with lead measures + a lag indicator; the weekly
      scoreboard counts up.
- [ ] **Calendar:** with `GCAL_ICS_URL` set, the agenda lists events; without it,
      you see the setup card (and the ⚙ embed option).
- [ ] **Sync:** open `localhost:3000` in a second browser/incognito, sign in,
      change something in one → it appears in the other within ~1s.
- [ ] **Sign out:** Main → ⚙ (gear) → **Sign out** returns you to the lock screen.

## 4. Deploy

Once it works locally:

1. Push to GitHub → import to Vercel (see [KEYS.md](KEYS.md)).
2. Add the **same** env var names (from your `.env`) in
   **Vercel → Settings → Environment Variables**.
3. Deploy. Then point the iOS app's `Config.swift` at your Vercel URL.

---

### Troubleshooting

| Symptom | Fix |
|---|---|
| Stuck on "Checking your session…" | `SUPABASE_URL`/`SUPABASE_ANON_KEY` missing → check `.env` + restart `vercel dev`. |
| No code email arrives | Enable Email provider; check the Magic Link template has `{{ .Token }}`; check spam. |
| Code says invalid | OTP expired, or the email template still sends only a link. Re-send. |
| Signed in but no data / "permission denied" | Your email doesn't match the RLS policy email. Fix policy #2 or `ALLOWED_EMAILS`. |
| Pages work but nothing syncs | You opened `file://` instead of `vercel dev`, so `/api/config` didn't run. |
