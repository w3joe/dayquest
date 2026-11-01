import MapKit
import SwiftUI

/// Today's trace and the end-of-day status. Lays out side by side when there is room
/// (iPhone Duo unfolded, landscape) and stacked on the folded/narrow screen.
struct TodayView: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        GeometryReader { geo in
            // Unfolded (≥ 600 pt) or any landscape screen gets the side-by-side layout.
            if geo.size.width >= 600 || (geo.size.width >= 520 && geo.size.width > geo.size.height) {
                HStack(spacing: 0) {
                    TraceMap()
                        .frame(width: geo.size.width * 0.56)
                    ScrollView { panels.padding(16) }
                }
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        TraceMap().frame(height: max(260, geo.size.height * 0.42))
                        panels.padding(16)
                    }
                }
            }
        }
        .background(Theme.ink)
    }

    private var panels: some View {
        VStack(spacing: 16) {
            StatusCard()
            if engine.running || !engine.log.isEmpty || engine.failure != nil { GeneratingLog() }
            TimelineCard()
        }
    }
}

struct TraceMap: View {
    @Environment(DayEngine.self) private var engine
    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        let store = engine.store
        Map(position: $camera) {
            if store.points.count > 1 {
                MapPolyline(coordinates: store.points.map(\.coordinate))
                    .stroke(Theme.route, style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [2, 8]))
            }
            ForEach(Array(store.stops.enumerated()), id: \.element.id) { index, stop in
                Annotation(stop.label, coordinate: stop.coordinate) {
                    Text("\(index + 1)")
                        .font(Theme.pixel(11))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 22, height: 22)
                        .background(Theme.accent)
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 2))
                }
            }
            UserAnnotation()
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .onChange(of: store.stops.count) { camera = .automatic }
    }
}

struct StatusCard: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        @Bindable var recorder = engine.recorder
        let store = engine.store
        QuestCard(title: recorder.isRecording ? "● RECORDING TODAY" : "○ NOT RECORDING") {
            Group {
                row("LOCATION", recorder.permissionText, recorder.hasAlways)
                row("STOPS", "\(store.stops.count) · \(String(format: "%.1f", store.distanceKm)) KM", !store.stops.isEmpty)
                row("DAY ENDS", engine.endOfDay.formatted(date: .omitted, time: .shortened)
                    + (engine.autoGenerate ? " · AUTO" : " · MANUAL"), engine.autoGenerate)
                if store.isDemo { row("TRACE", "DEMO DAY (SPEC §3)", true) }
            }
            if !recorder.hasAlways {
                PixelButton(title: "ALLOW ALWAYS LOCATION", filled: false) { recorder.requestAlways() }
            }
            Toggle("RECORD IN BACKGROUND", isOn: $recorder.isRecording)
                .font(Theme.pixel(13))
                .onChange(of: recorder.isRecording) { _, on in if on && !recorder.hasAlways { recorder.requestAlways() } }

            if let id = engine.generatedId {
                PixelButton(title: "▶ PLAY TODAY") { engine.presentedDayId = id }
            } else {
                PixelButton(title: engine.running ? "BUILDING YOUR WORLD…" : "END MY DAY NOW") {
                    Task { await engine.generate() }
                }
                .disabled(engine.running || store.stops.isEmpty)
                .opacity(store.stops.isEmpty ? 0.5 : 1)
            }

            // Plain buttons rather than a menu: quicker to hit on stage.
            HStack(spacing: 8) {
                demoButton("SEED DEMO") { Task { await store.seedDemo(animated: false) } }
                demoButton("REPLAY LIVE") { Task { await store.seedDemo(animated: true) } }
                demoButton("END IN 8S") { engine.endDaySoon() }
            }
            demoButton("START A FRESH DAY") { engine.clearResult() }
        }
    }

    private func demoButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(Theme.pixel(11)).foregroundStyle(Theme.accent).lineLimit(1).minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity).padding(.vertical, 8)
                .overlay(Rectangle().strokeBorder(Theme.accent.opacity(0.6), lineWidth: 2))
        }
        .buttonStyle(.plain)
    }

    private func row(_ key: String, _ value: String, _ ok: Bool) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(key).font(Theme.pixel(12)).foregroundStyle(Theme.edge.opacity(0.7))
            Spacer()
            Text(value).font(Theme.pixel(12)).foregroundStyle(ok ? Theme.ok : Theme.edge).multilineTextAlignment(.trailing)
        }
    }
}

struct TimelineCard: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        QuestCard(title: "TODAY'S STOPS") {
            if engine.store.stops.isEmpty {
                Text("Nothing yet. Go somewhere, or seed the demo day.")
                    .font(Theme.pixel(12, .regular)).foregroundStyle(Theme.edge.opacity(0.7))
            }
            ForEach(engine.store.stops) { stop in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(DayFormat.time.string(from: stop.arrival)).font(Theme.pixel(13)).foregroundStyle(Theme.accent)
                    Text(stop.label.uppercased()).font(Theme.pixel(13, .regular))
                    Spacer()
                    Text("✓").font(Theme.pixel(13)).foregroundStyle(Theme.ok)
                }
                .transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .animation(.easeOut, value: engine.store.stops.count)
    }
}
