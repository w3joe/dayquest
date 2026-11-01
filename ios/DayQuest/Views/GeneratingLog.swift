import SwiftUI

/// Native version of the web /generating log: one line per streamed event, thumbnails inline.
struct GeneratingLog: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        QuestCard(title: engine.running ? "> BUILDING YOUR WORLD…" : "> GENERATION LOG") {
            ForEach(engine.log) { event in
                HStack(spacing: 10) {
                    if let image = thumbnail(event.thumb) {
                        Image(uiImage: image).interpolation(.none).resizable().scaledToFit().frame(width: 32, height: 32)
                    }
                    Text("> \(event.label)")
                        .font(Theme.pixel(12, .regular))
                        .foregroundStyle(event.step == "error" ? Theme.route : event.step == "done" ? Theme.ok : Theme.edge)
                }
            }
            if engine.running { ProgressView().tint(Theme.accent) }
            if let failure = engine.failure {
                Text(failure).font(Theme.pixel(12, .regular)).foregroundStyle(Theme.route)
            }
        }
    }

    private func thumbnail(_ thumb: String?) -> UIImage? {
        guard let thumb, let comma = thumb.firstIndex(of: ","), thumb.hasPrefix("data:"),
              let data = Data(base64Encoded: String(thumb[thumb.index(after: comma)...])) else { return nil }
        return UIImage(data: data)
    }
}
