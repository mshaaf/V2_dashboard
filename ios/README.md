# Dashboard — iOS (Swift) app

A thin **WKWebView** wrapper around your deployed dashboard. You keep the
whole web UI (and cross-device Supabase sync), but get a real Swift app on
your home screen with a native launch, pull-to-refresh, swipe-back, and
persistent login/localStorage.

> Why a wrapper and not a native rewrite? You said you like the UI. This keeps
> one codebase (the web app), so every feature you build on the web shows up in
> the app instantly — no Swift changes needed.

## What's here

```
ios/Dashboard/
  DashboardApp.swift   # @main app entry
  ContentView.swift    # full-screen web view + top loading bar
  WebView.swift        # WKWebView wrapper (persistent data, pull-to-refresh, link handling)
  Config.swift         # 👉 set your Vercel URL here
  Info.plist           # reference values (camera/photo perms, status bar)
```

These are **source files**, not a prebuilt `.xcodeproj`. Creating the project
in Xcode takes ~2 minutes:

## Build it (one time)

1. **Deploy the web app to Vercel first** and copy its URL (e.g.
   `https://your-dashboard.vercel.app`). See [`../KEYS.md`](../KEYS.md).
2. Open **Xcode → File → New → Project → iOS → App**.
   - Product Name: `Dashboard`
   - Interface: **SwiftUI**, Language: **Swift**
   - Uncheck Core Data / Tests.
3. In the new project, **delete** the auto-generated `ContentView.swift` and the
   `…App.swift`, then **drag in** the four `.swift` files from `ios/Dashboard/`
   (check "Copy items if needed").
4. Open **`Config.swift`** and set `dashboardURL` to your Vercel URL.
5. Add the permission strings from `Info.plist` to your target:
   **Target → Info → Custom iOS Target Properties**, add:
   - `Privacy - Camera Usage Description` → "Take progress photos for your gym tracker."
   - `Privacy - Photo Library Usage Description` → "Attach progress photos from your library."
   (Only needed if you use the gym progress-photo feature.)
6. Pick your iPhone (or a simulator) and press **▶ Run**.

That's it — the app boots straight into your dashboard.

## Notes

- **Local use / offline:** this wrapper loads your live Vercel URL, so it needs
  network. Pages you've visited are cached by WKWebView and your data lives in
  `localStorage` (persisted by `WKWebsiteDataStore.default()`), so quick offline
  reopen mostly works, but first load needs a connection. If you later want a
  fully-offline bundle, that's a different build (ship the HTML inside the app) —
  ask and it can be added.
- **WHOOP login** works in-app because cookies + redirects are persisted. Make
  sure your Vercel domain is registered as a WHOOP redirect URI (see `KEYS.md`).
- **Status bar / notches:** the web view fills the screen and the page CSS uses
  `env(safe-area-inset-*)`, so content already dodges the notch and home bar.
- **App icon / name:** set in the target's General + Assets, as usual.
