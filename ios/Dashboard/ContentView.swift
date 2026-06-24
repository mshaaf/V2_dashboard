import SwiftUI

struct ContentView: View {
    @State private var isLoading = true
    @State private var progress = 0.0

    var body: some View {
        ZStack(alignment: .top) {
            // Background matches the web app so there's no white flash on launch.
            Color(red: 0.02, green: 0.02, blue: 0.024).ignoresSafeArea()

            WebView(url: AppConfig.dashboardURL, isLoading: $isLoading, progress: $progress)
                .ignoresSafeArea()   // let the page's CSS env(safe-area-inset-*) handle notches

            // Thin top progress bar while pages load.
            if isLoading && progress < 1.0 {
                ProgressView(value: progress)
                    .progressViewStyle(.linear)
                    .tint(.white)
                    .padding(.horizontal, 0)
            }
        }
    }
}

#Preview {
    ContentView().preferredColorScheme(.dark)
}
