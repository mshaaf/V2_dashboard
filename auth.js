// =============================================================
// auth.js — email + password sign-in gate (Supabase)
//
// Drop on any page with:  <script src="auth.js"></script>  in <head>.
// It is self-bootstrapping: it loads /api/config and the Supabase
// client if they aren't already present, shows a full-screen login
// overlay, and only reveals the page once a valid, allow-listed
// session exists.
//
// Flow:  email + password  →  signInWithPassword (auto signUp if new)  →
//        session persisted in localStorage  →  reload.
//
// Config (from /api/config → window.DASH_*):
//   DASH_SUPABASE_URL / DASH_SUPABASE_KEY  — required to enforce the gate
//   DASH_ALLOWED_EMAILS  — comma list of emails allowed in (empty = any)
//
// If Supabase isn't configured (no URL/key), the gate is SKIPPED so you
// can never lock yourself out of an un-provisioned deploy.
//
// Supabase setup: Authentication → Providers → Email → enable "Email"
// and TURN OFF "Confirm email" so password sign-up logs you in instantly
// (otherwise a new account must confirm via email before it has a session).
// =============================================================
(function () {
  'use strict';

  // Never gate an embedded iframe (e.g. the water tracker inside health).
  try { if (window.self !== window.top) return; } catch (e) { return; }

  var CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  var overlay = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      (document.head || document.documentElement).appendChild(s);
    });
  }
  async function ensureConfig() {
    if (typeof window.DASH_SUPABASE_URL !== 'undefined') return;
    try { await loadScript('/api/config'); } catch (e) {}
  }
  async function ensureSupabase() {
    if (window.supabase && window.supabase.createClient) return;
    try { await loadScript(CDN); } catch (e) {}
  }

  function allowedEmails() {
    var raw = window.DASH_ALLOWED_EMAILS || '';
    return raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }
  function isAllowed(email) {
    var list = allowedEmails();
    if (!list.length) return true; // no allowlist configured → anyone with a code
    return list.indexOf((email || '').toLowerCase()) !== -1;
  }

  // ---------- overlay UI ----------
  function injectStyle() {
    if (document.getElementById('dash-auth-style')) return;
    var css =
      '#dash-auth{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;'
      + 'padding:24px;background:#050506;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif;}'
      + '#dash-auth .da-card{width:100%;max-width:360px;text-align:center;}'
      + '#dash-auth .da-logo{font-size:30px;margin-bottom:10px;}'
      + '#dash-auth h1{color:#FAFAFA;font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 6px;}'
      + '#dash-auth p{color:#76746E;font-size:13.5px;line-height:1.5;margin:0 0 20px;}'
      + '#dash-auth input{width:100%;padding:14px 15px;border:1px solid rgba(255,255,255,0.10);border-radius:13px;'
      + 'background:rgba(255,255,255,0.04);color:#FAFAFA;font-family:inherit;font-size:16px;outline:none;-webkit-appearance:none;text-align:center;transition:border-color .2s;}'
      + '#dash-auth input:focus{border-color:rgba(125,211,252,0.55);}'
      + '#dash-auth input.code{letter-spacing:0.5em;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:22px;font-weight:700;padding-left:0.5em;}'
      + '#dash-auth button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:13px;background:linear-gradient(180deg,#FFFFFF,#E8E5DD);'
      + 'color:#0A0A0B;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;transition:filter .15s,transform .1s;}'
      + '#dash-auth button:active{transform:translateY(1px);}'
      + '#dash-auth button:disabled{opacity:.5;cursor:default;}'
      + '#dash-auth .da-ghost{background:transparent;color:#76746E;border:1px solid rgba(255,255,255,0.10);box-shadow:none;}'
      + '#dash-auth .da-msg{min-height:18px;font-size:12.5px;margin-top:12px;color:#ff8a8a;}'
      + '#dash-auth .da-msg.ok{color:#6BE3A4;}';
    var st = document.createElement('style');
    st.id = 'dash-auth-style'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  function mountOverlay(innerHtml) {
    injectStyle();
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dash-auth';
      (document.body || document.documentElement).appendChild(overlay);
    }
    overlay.innerHTML = '<div class="da-card">' + innerHtml + '</div>';
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
  }
  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    try { document.documentElement.style.overflow = ''; } catch (e) {}
  }
  function showChecking() {
    mountOverlay('<div class="da-logo">🔒</div><h1>Dashboard</h1><p>Checking your session…</p>');
  }

  var supa = null;

  function showEmailStep(prefill, msg) {
    mountOverlay(
      '<div class="da-logo">🔒</div><h1>Sign in</h1>'
      + '<p>Enter your email and password to access the dashboard.</p>'
      + '<input id="da-email" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" value="' + (prefill || '') + '" style="margin-bottom: 10px;">'
      + '<input id="da-password" type="password" placeholder="••••••••">'
      + '<button id="da-send" type="button">Sign In / Register</button>'
      + '<div class="da-msg' + (msg && msg.ok ? ' ok' : '') + '">' + (msg ? msg.text : '') + '</div>'
    );
    var emailEl = document.getElementById('da-email');
    var passEl = document.getElementById('da-password');
    var btn = document.getElementById('da-send');
    setTimeout(function () { if (emailEl && !emailEl.value) { emailEl.focus(); } else if (passEl) { passEl.focus(); } }, 60);

    function handleAuth() {
      var email = (emailEl.value || '').trim();
      var password = (passEl.value || '');
      if (!email || email.indexOf('@') === -1) { emailEl.focus(); return; }
      if (!password || password.length < 6) {
        showEmailStep(email, { text: 'Password must be at least 6 characters.' });
        return;
      }
      if (!isAllowed(email)) { showEmailStep(email, { text: 'That email isn’t allowed on this dashboard.' }); return; }

      btn.disabled = true; btn.textContent = 'Authenticating…';

      // Step A: Attempt standard login
      supa.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          // Step B: If account doesn't exist, automatically sign them up
          if (res.error && (res.error.status === 400 || res.error.message.toLowerCase().indexOf('invalid login') !== -1)) {
            return supa.auth.signUp({ email: email, password: password });
          }
          return res;
        })
        .then(function (res) {
          if (res && res.error) {
            showEmailStep(email, { text: res.error.message || 'Authentication failed.' });
            return;
          }
          var em = res.data && res.data.user && res.data.user.email;
          if (!isAllowed(em)) { supa.auth.signOut(); showEmailStep('', { text: 'That account isn’t allowed here.' }); return; }

          // Successful login or registration with "Confirm email" turned OFF
          window.location.reload();
        })
        .catch(function (e) { showEmailStep(email, { text: String(e && e.message || e) }); });
    }

    btn.addEventListener('click', handleAuth);
    passEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleAuth(); });
    emailEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleAuth(); });
  }

  // Expose a sign-out helper any page can call (e.g. a Settings button).
  window.dashSignOut = function () {
    try { if (supa) supa.auth.signOut().then(function () { window.location.reload(); }); }
    catch (e) { window.location.reload(); }
  };

  async function boot() {
    showChecking();
    await ensureConfig();

    var url = window.DASH_SUPABASE_URL || '';
    var key = window.DASH_SUPABASE_KEY || '';
    if (!url || !key) {
      // Not provisioned yet → don't lock anyone out; run unguarded.
      console.warn('[auth] Supabase not configured (no DASH_SUPABASE_URL/KEY) — sign-in gate disabled.');
      removeOverlay();
      return;
    }

    await ensureSupabase();
    if (!window.supabase || !window.supabase.createClient) { removeOverlay(); return; }

    supa = window.supabase.createClient(url, key);
    window.__dashSupa = supa;

    var session = null;
    try { var r = await supa.auth.getSession(); session = r.data && r.data.session; } catch (e) {}

    if (session && session.user) {
      if (isAllowed(session.user.email)) { removeOverlay(); return; }   // ✅ in
      try { await supa.auth.signOut(); } catch (e) {}
      showEmailStep('', { text: 'Signed out — that account isn’t allowed here.' });
      return;
    }
    showEmailStep('');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
