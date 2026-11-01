import SwiftUI
import WebKit

/// The generated day, played in the web game at /day/<id>.
struct DayResultView: View {
    @Environment(DayEngine.self) private var engine
    let id: String

    var body: some View {
        Group {
            if let url = engine.dayURL(id) {
                WebView(url: url).ignoresSafeArea(edges: .bottom)
            } else {
                Text("Server URL is not valid.").font(Theme.mono(13))
            }
        }
        .background(Theme.paper)
        .navigationTitle("TODAY")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = engine.dayURL(id) {
                ToolbarItem(placement: .topBarTrailing) { ShareLink(item: url) }
            }
        }
    }
}

struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = UIColor(Theme.paper)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        if view.url == nil { view.load(URLRequest(url: url)) }
    }
}
