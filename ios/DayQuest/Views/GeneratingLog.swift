import SwiftUI

/// Native version of the web /generating log: one line per streamed event, thumbnails inline.
struct GeneratingLog: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        Panel(eyebrow: "04 / BUILDING", title: engine.running ? "Building your world…" : "How it was built.",
              trailing: engine.running ? "WORKING" : engine.failure == nil ? "DONE" : nil) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(engine.log) { event in
                    HStack(spacing: 10) {
                        if let image = thumbnail(event.thumb) {
                            Image(uiImage: image).interpolation(.none).resizable().scaledToFit().frame(width: 28, height: 28)
                                .background(Color(hex: 0xE4E8D7))
                        }
                        Text("> \(event.label)")
                            .font(Theme.mono(10))
                            .foregroundStyle(event.step == "error" ? Theme.error : event.step == "done" ? Theme.tick : Theme.ink)
                    }
                }
                if engine.running { ProgressView().tint(Theme.green) }
                if let failure = engine.failure {
                    Text(failure).font(Theme.body(11)).foregroundStyle(Theme.error)
                }
            }
        }
    }

    private func thumbnail(_ thumb: String?) -> UIImage? {
        guard let thumb, let comma = thumb.firstIndex(of: ","), thumb.hasPrefix("data:"),
              let data = Data(base64Encoded: String(thumb[thumb.index(after: comma)...])) else { return nil }
        return UIImage(data: data)
    }
}
