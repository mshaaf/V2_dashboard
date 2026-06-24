import Foundation

enum AppConfig {
    // 👉 SET THIS to your deployed dashboard URL from Vercel.
    //    Example: "https://your-dashboard.vercel.app"
    //
    //    For pure local testing you can point at a Mac dev server on your
    //    LAN, e.g. "http://192.168.1.20:8080" — but then add an ATS
    //    exception in Info.plist (see ios/README.md), since that's plain HTTP.
    static let dashboardURL = URL(string: "https://your-dashboard.vercel.app")!
}
