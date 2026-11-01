import MapKit
import PhotosUI
import SwiftUI

/// One screen per moment of the demo: start recording → watch the day fill in →
/// building → your world. Wide screens (unfolded iPhone Duo, landscape) put the map beside the rest.
struct TodayView: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        ZStack {
            PaperBackground()
            switch engine.phase {
            case .idle: StartScreen().transition(.opacity.combined(with: .scale(scale: 0.96)))
            case .recording: RecordingScreen().transition(.move(edge: .bottom).combined(with: .opacity))
            case .building: BuildingScreen().transition(.opacity)
            case .done: DoneScreen().transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.5), value: engine.phase)
    }
}

// MARK: Start

private struct StartScreen: View {
    @Environment(DayEngine.self) private var engine
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            Sprite(name: "cat", size: 112).hop(10, duration: 0.7)
            VStack(spacing: 10) {
                Text("Today is a little quest.")
                    .font(Theme.pixel(32)).foregroundStyle(Theme.ink).multilineTextAlignment(.center)
                Text("Press start and go about your day. We'll quietly remember where you went, and turn it into a world someone can visit tonight.")
                    .font(Theme.body(15)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
            }
            Spacer()
            Button { engine.startRecording() } label: {
                ZStack {
                    Circle().fill(Theme.pink).frame(width: 210, height: 210)
                        .scaleEffect(pulse ? 1.12 : 0.92).opacity(pulse ? 0 : 0.8)
                    Circle().fill(Theme.pink.opacity(0.6)).frame(width: 190, height: 190)
                        .scaleEffect(pulse ? 1.04 : 0.96)
                    Circle().fill(Theme.hot).frame(width: 164, height: 164)
                        .overlay(Circle().strokeBorder(.white, lineWidth: 5))
                        .shadow(color: Theme.hot.opacity(0.35), radius: 14, y: 6)
                    VStack(spacing: 6) {
                        Sprite(name: "landmark", size: 44)
                        Text("START").font(Theme.pixel(26)).foregroundStyle(.white)
                        Text("recording today").font(Theme.pixel(13)).foregroundStyle(.white.opacity(0.9))
                    }
                }
            }
            .buttonStyle(.plain)
            .onAppear { withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { pulse = true } }

            Text(engine.recorder.hasAlways ? "Location: always on · day ends \(engine.endOfDay.formatted(date: .omitted, time: .shortened))"
                                            : "We'll ask to use your location in the background")
                .font(Theme.mono(11)).foregroundStyle(Theme.muted)
            FitChip()
            Spacer(minLength: 20)
        }
        .padding(.horizontal, 24)
    }
}

// MARK: Recording

private struct RecordingScreen: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width >= 600 || (geo.size.width >= 520 && geo.size.width > geo.size.height)
            Group {
                if wide {
                    HStack(alignment: .top, spacing: 22) {
                        VStack(spacing: 16) { RecordingHeader(); MapCard(height: geo.size.height - 150) }
                            .frame(width: geo.size.width * 0.55)
                        ScrollView { VStack(spacing: 16) { StopsCard(); EndCard() }.padding(.vertical, 4) }
                    }
                } else {
                    ScrollView {
                        VStack(spacing: 16) {
                            RecordingHeader()
                            MapCard(height: max(240, geo.size.height * 0.4))
                            StopsCard()
                            EndCard()
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .padding(.horizontal, 18).padding(.top, 8)
        }
    }
}

private struct RecordingHeader: View {
    @Environment(DayEngine.self) private var engine
    @State private var blink = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack(spacing: 12) {
                Circle().fill(Theme.hot).frame(width: 14, height: 14)
                    .overlay(Circle().stroke(Theme.hot.opacity(0.4), lineWidth: blink ? 10 : 0))
                    .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { blink = true } }
                VStack(alignment: .leading, spacing: 2) {
                    Text(engine.recorder.isRecording ? "Recording your day" : "Your day so far").font(Theme.pixel(22)).foregroundStyle(Theme.ink)
                    Text(elapsed(at: context.date)).font(Theme.mono(12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                Sprite(name: "cat", size: 46).hop(5, duration: 0.45)
            }
        }
    }

    private func elapsed(at now: Date) -> String {
        let store = engine.store
        let km = String(format: "%.1f km", store.distanceKm)
        guard let since = engine.recordingSince else { return "\(store.stops.count) stops · \(km)" }
        let s = max(0, Int(now.timeIntervalSince(since)))
        return String(format: "%02d:%02d:%02d · %d stops · %@", s / 3600, (s / 60) % 60, s % 60, store.stops.count, km)
    }
}

private struct MapCard: View {
    var height: CGFloat
    var body: some View {
        TraceMap()
            .frame(height: height)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Theme.edge, lineWidth: 3))
            .background(RoundedRectangle(cornerRadius: 22).fill(Theme.shadow).offset(x: 4, y: 4))
    }
}

struct TraceMap: View {
    @Environment(DayEngine.self) private var engine
    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        let store = engine.store
        // Static, so it never traps the page scroll; the camera follows the trace.
        Map(position: $camera, interactionModes: []) {
            if store.points.count > 1 {
                MapPolyline(coordinates: store.points.map(\.coordinate))
                    .stroke(Theme.hot, style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round, dash: [2, 9]))
            }
            ForEach(Array(store.stops.enumerated()), id: \.element.id) { index, stop in
                Annotation("", coordinate: stop.coordinate) {
                    StopPin(number: index + 1, latest: index == store.stops.count - 1)
                }
            }
            UserAnnotation()
        }
        .mapStyle(.standard(emphasis: .muted, pointsOfInterest: .excludingAll))
        .environment(\.colorScheme, .light)
        .onChange(of: store.stops.count) { withAnimation(.easeInOut(duration: 0.8)) { camera = .automatic } }
    }
}

/// Pops in with a bounce; the newest stop keeps a soft ripple.
private struct StopPin: View {
    var number: Int
    var latest: Bool
    @State private var shown = false
    @State private var ripple = false

    var body: some View {
        ZStack {
            if latest {
                Circle().fill(Theme.hot.opacity(0.35)).frame(width: 44, height: 44)
                    .scaleEffect(ripple ? 1.4 : 0.4).opacity(ripple ? 0 : 1)
            }
            Text("\(number)").font(Theme.pixel(12)).foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(Theme.hot, in: Circle())
                .overlay(Circle().strokeBorder(.white, lineWidth: 3))
        }
        .scaleEffect(shown ? 1 : 0.1)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.5)) { shown = true }
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { ripple = true }
        }
    }
}

private struct StopsCard: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        let stops = engine.store.stops
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Where you went").font(Theme.pixel(19)).foregroundStyle(Theme.ink)
                    Spacer()
                    Text("\(stops.count) STOPS").font(Theme.mono(11)).foregroundStyle(Theme.muted)
                }
                if stops.isEmpty {
                    HStack(spacing: 10) {
                        ProgressView().tint(Theme.hot)
                        Text("Listening for your first stop…").font(Theme.body(14)).foregroundStyle(Theme.muted)
                    }
                }
                ForEach(Array(stops.enumerated().reversed()), id: \.element.id) { index, stop in
                    HStack(spacing: 12) {
                        Sprite(name: sprite(for: stop.label), size: 30)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(stop.label).font(Theme.body(14, .semibold)).foregroundStyle(Theme.ink).lineLimit(1)
                            Text(DayFormat.time.string(from: stop.arrival)).font(Theme.mono(11)).foregroundStyle(Theme.muted)
                        }
                        Spacer(minLength: 0)
                        Text("✓").font(Theme.pixel(15)).foregroundStyle(Theme.ok)
                    }
                    .padding(10)
                    .background(index == stops.count - 1 ? Theme.butter : Color.white, in: RoundedRectangle(cornerRadius: 14))
                    .transition(.asymmetric(insertion: .move(edge: .top).combined(with: .opacity).combined(with: .scale(scale: 0.8)),
                                            removal: .opacity))
                }
            }
            .animation(.spring(response: 0.45, dampingFraction: 0.7), value: stops.count)
        }
    }

    private func sprite(for label: String) -> String {
        let l = label.lowercased()
        if ["ramen", "kanada", "cafe", "café", "restaurant", "lunch", "food", "bar"].contains(where: l.contains) { return "food" }
        if ["park", "garden", "fountain", "lake"].contains(where: l.contains) { return "flower" }
        if ["station", "bus", "tube"].contains(where: l.contains) { return "star" }
        return "landmark"
    }
}

private struct EndCard: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        let store = engine.store
        Card(tint: Theme.butter.opacity(0.5)) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Ready to call it a day?").font(Theme.pixel(20)).foregroundStyle(Theme.ink)
                Text(store.stops.isEmpty
                     ? "Your stops will pop in here as you move."
                     : "We'll build it automatically at \(engine.endOfDay.formatted(date: .omitted, time: .shortened)), or you can end it now.")
                    .font(Theme.body(13)).foregroundStyle(Theme.muted)
                PillButton(title: "End my day", sprite: "heart") { Task { await engine.generate() } }
                    .disabled(store.stops.isEmpty).opacity(store.stops.isEmpty ? 0.5 : 1)
                HStack(spacing: 8) {
                    SmallButton(title: "Replay demo day") { Task { await engine.store.seedDemo(animated: true) } }
                    SmallButton(title: "End in 8 s") { engine.endDaySoon() }
                }
                SmallButton(title: "Stop and start over") { engine.clearResult() }
            }
        }
    }
}

// MARK: Building

private struct BuildingScreen: View {
    @Environment(DayEngine.self) private var engine
    @State private var spin = false

    var body: some View {
        VStack(spacing: 18) {
            Spacer(minLength: 10)
            ZStack {
                ForEach(0..<6) { i in
                    Sprite(name: i.isMultiple(of: 2) ? "star" : "heart", size: 26)
                        .offset(y: -86)
                        .rotationEffect(.degrees(Double(i) * 60 + (spin ? 360 : 0)))
                }
                Sprite(name: "cat", size: 104).hop(14, duration: 0.35)
            }
            .frame(height: 220)
            .onAppear { withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) { spin = true } }

            Text(engine.failure == nil ? "Building your little world…" : "That didn't work")
                .font(Theme.pixel(26)).foregroundStyle(Theme.ink)

            Card {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(engine.log) { event in
                                HStack(spacing: 10) {
                                    if let image = thumbnail(event.thumb) {
                                        Image(uiImage: image).interpolation(.none).resizable().scaledToFit()
                                            .frame(width: 34, height: 34)
                                            .background(Theme.sky.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
                                    }
                                    Text(event.label.capitalized(with: nil))
                                        .font(Theme.body(13)).foregroundStyle(event.step == "error" ? Theme.error : Theme.ink)
                                    Spacer(minLength: 0)
                                }
                                .id(event.id)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                            }
                            if let failure = engine.failure {
                                Text(failure).font(Theme.body(13)).foregroundStyle(Theme.error)
                            }
                        }
                        .animation(.spring(duration: 0.35), value: engine.log.count)
                    }
                    .frame(maxHeight: 260)
                    .onChange(of: engine.log.count) { if let last = engine.log.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
                }
            }
            .frame(maxWidth: 560)
            if engine.failure != nil {
                HStack(spacing: 10) {
                    SmallButton(title: "Try again") { Task { await engine.generate() } }
                    SmallButton(title: "Back to my day") { engine.dismissFailure() }
                }
                .frame(maxWidth: 560)
            }
            Spacer(minLength: 10)
        }
        .padding(.horizontal, 22)
    }

    private func thumbnail(_ thumb: String?) -> UIImage? {
        guard let thumb, let comma = thumb.firstIndex(of: ","), thumb.hasPrefix("data:"),
              let data = Data(base64Encoded: String(thumb[thumb.index(after: comma)...])) else { return nil }
        return UIImage(data: data)
    }
}

// MARK: Done

private struct DoneScreen: View {
    @Environment(DayEngine.self) private var engine
    @State private var burst = false

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            ZStack {
                ForEach(0..<10) { i in
                    Sprite(name: ["heart", "star", "flower"][i % 3], size: 28)
                        .offset(y: burst ? -120 : 0)
                        .rotationEffect(.degrees(Double(i) * 36))
                        .opacity(burst ? 0.9 : 0)
                }
                Sprite(name: "cat", size: 120).hop(8, duration: 0.5)
            }
            .frame(height: 280)
            .onAppear { withAnimation(.spring(response: 0.8, dampingFraction: 0.55)) { burst = true } }
            Text("Your world is ready!").font(Theme.pixel(30)).foregroundStyle(Theme.ink)
            Text("\(engine.store.stops.count) stops turned into a little world you can walk around and share.")
                .font(Theme.body(15)).foregroundStyle(Theme.muted).multilineTextAlignment(.center).frame(maxWidth: 420)
            Spacer()
            VStack(spacing: 12) {
                PillButton(title: "Play my day", sprite: "star") { engine.presentedDayId = engine.generatedId }
                if let id = engine.generatedId, let url = engine.dayURL(id) {
                    ShareLink(item: url) {
                        Text("Share the link").font(Theme.pixel(15)).foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Color.white, in: Capsule())
                            .overlay(Capsule().strokeBorder(Theme.edge, lineWidth: 3))
                    }
                }
                Button("Start a new day") { engine.clearResult() }
                    .font(Theme.pixel(14)).foregroundStyle(Theme.muted).padding(.top, 4)
            }
            .frame(maxWidth: 460)
            Spacer(minLength: 20)
        }
        .padding(.horizontal, 24)
    }
}

// MARK: Fit check (optional)

private struct FitChip: View {
    @Environment(DayEngine.self) private var engine
    @State private var pick: PhotosPickerItem?

    var body: some View {
        let fit = engine.fit
        PhotosPicker(selection: $pick, matching: .images) {
            HStack(spacing: 10) {
                if let sprite = fit.sprite {
                    Image(uiImage: sprite).resizable().interpolation(.none).scaledToFit().frame(width: 26, height: 38)
                } else {
                    Sprite(name: "shirt", size: 30)
                }
                Text(fit.busy ? "Stitching your outfit into pixels…" : fit.sprite != nil ? "Your character is ready" : "Add today's fit (optional)")
                    .font(Theme.pixel(14)).foregroundStyle(Theme.ink)
                if fit.busy { ProgressView().tint(Theme.hot) }
            }
            .padding(.vertical, 8).padding(.horizontal, 16)
            .background(Color.white, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.edge, lineWidth: 3))
        }
        .buttonStyle(.plain)
        .disabled(fit.busy)
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) { await engine.makeCharacter(from: data) }
                pick = nil
            }
        }
        if let error = fit.error {
            Text(error).font(Theme.body(12)).foregroundStyle(Theme.error).multilineTextAlignment(.center)
        }
    }
}
