import SwiftUI

@main
struct DashboardApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)   // matches the dashboard's dark UI
        }
    }
}
