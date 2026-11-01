import MapKit
import PhotosUI
import SwiftUI

/// Native version of the web Today screen. One column when folded or narrow; on the unfolded
/// iPhone Duo (≥ 600 pt) or in landscape, the places panel sits beside everything else.
struct TodayView: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width >= 600 || (geo.size.width >= 520 && geo.size.width > geo.size.height)
            ScrollView {
                VStack(alignment: .leading, spacing: 25) {
                    Header()
                    Hero(wide: wide)
                    if wide {
                        let column = (geo.size.width - 56 - 25) * 0.58
                        HStack(alignment: .top, spacing: 25) {
                            PlacesPanel(mapHeight: max(320, geo.size.height * 0.55)).frame(width: column)
                            VStack(spacing: 25) { side }
                        }
                    } else {
                        PlacesPanel(mapHeight: 240)
                        side
                    }
                    Finish()
                    Footer()
                }
                .padding(.horizontal, wide ? 28 : 18)
            }
        }
        .background(Theme.paper)
    }

    @ViewBuilder private var side: some View {
        FitPanel()
        DayEndPanel()
        if engine.running || !engine.log.isEmpty || engine.failure != nil { GeneratingLog() }
    }
}

private struct Header: View {
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                (Text("✦ ").foregroundStyle(Theme.orange) + Text("dayquest") + Text(".").foregroundStyle(Theme.orange))
                    .font(Theme.display(25))
                    .foregroundStyle(Theme.ink)
                Spacer()
                Eyebrow(text: "A DAY WORTH VISITING", color: Theme.ink)
            }
            .frame(height: 64)
            Rectangle().fill(Theme.line).frame(height: 1)
        }
    }
}

private struct Hero: View {
    var wide: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Eyebrow(text: "YOUR STEPS / YOUR LITTLE WORLD")
            (Text("Ordinary day.\n") + Text("Extraordinary little world.").foregroundStyle(Theme.orange))
                .font(Theme.display(wide ? 39 : 32))
                .foregroundStyle(Theme.ink)
            Text("Keep your phone in your pocket. We'll remember the places you go, and when the day ends we'll build them into a world someone can visit.")
                .font(Theme.body(12)).lineSpacing(5).foregroundStyle(Color(hex: 0x747C6D))
        }
        .padding(.top, 10)
    }
}

// MARK: 01 / THE PLACES

private struct PlacesPanel: View {
    @Environment(DayEngine.self) private var engine
    var mapHeight: CGFloat

    var body: some View {
        @Bindable var recorder = engine.recorder
        let store = engine.store
        Panel(eyebrow: "01 / THE PLACES", title: "A little further from home.",
              trailing: recorder.isRecording ? "RECORDING" : store.stops.isEmpty ? "PAUSED" : "DAY SYNCED") {
            VStack(alignment: .leading, spacing: 20) {
                VStack(spacing: 0) {
                    TraceMap().frame(height: mapHeight)
                    HStack {
                        Text("⌖ \(store.isDemo ? "LONDON, UK" : "TODAY")")
                        Spacer()
                        Text(store.isDemo ? "DEMO TRACE" : "RECORDED")
                    }
                    .font(Theme.mono(8)).foregroundStyle(Theme.ink)
                    .padding(11)
                    .overlay(alignment: .top) { Rectangle().fill(Color(hex: 0xCBD2B8)).frame(height: 1) }
                }
                .overlay(Rectangle().strokeBorder(Color(hex: 0xCBD2B8), lineWidth: 1))

                Timeline()

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("LOCATION").font(Theme.mono(9)).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(recorder.permissionText).font(Theme.mono(9)).foregroundStyle(recorder.hasAlways ? Theme.tick : Theme.orange)
                    }
                    if !recorder.hasAlways { SmallButton(title: "ALLOW ALWAYS LOCATION") { recorder.requestAlways() } }
                    Toggle(isOn: $recorder.isRecording) {
                        Text("Record in the background").font(Theme.body(12)).foregroundStyle(Theme.ink)
                    }
                    .tint(Theme.green)
                    .onChange(of: recorder.isRecording) { _, on in if on && !recorder.hasAlways { recorder.requestAlways() } }
                }
            }
        }
    }
}

private struct Timeline: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        let store = engine.store
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("YOUR DAY, IN LITTLE STOPS")
                Spacer()
                Text(String(format: "%02d STOPS", store.stops.count))
            }
            .font(Theme.mono(8)).tracking(0.6).foregroundStyle(Theme.muted)
            .padding(.bottom, 12)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
            .padding(.bottom, 10)

            if store.stops.isEmpty {
                Text("Nothing yet. Go somewhere, or load the demo day below.")
                    .font(Theme.body(11)).foregroundStyle(Theme.muted).padding(.vertical, 6)
            }
            ForEach(store.stops) { stop in
                HStack(spacing: 9) {
                    Text(DayFormat.time.string(from: stop.arrival)).font(Theme.mono(9)).foregroundStyle(Color(hex: 0x858879))
                        .frame(width: 37, alignment: .leading)
                    Rectangle().fill(Theme.orange).frame(width: 5, height: 5)
                    Text(stop.label).font(Theme.body(11)).foregroundStyle(Theme.ink).lineLimit(1)
                    Spacer(minLength: 0)
                    Text("✓").font(Theme.body(11)).foregroundStyle(Theme.tick)
                }
                .frame(minHeight: 27)
                .transition(.opacity.combined(with: .move(edge: .leading)))
            }

            HStack {
                Text("Recorded in the background · \(store.stops.count) stops")
                Spacer()
                Text(String(format: "%.1f KM", store.distanceKm))
            }
            .font(Theme.mono(8)).foregroundStyle(Theme.muted)
            .padding(.top, 18)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color(hex: 0xE8EADB))
                    Rectangle().fill(Color(hex: 0x7E9567)).frame(width: geo.size.width * engine.dayProgress)
                }
            }
            .frame(height: 6).padding(.top, 9)
        }
        .animation(.easeOut, value: store.stops.count)
    }
}

struct TraceMap: View {
    @Environment(DayEngine.self) private var engine
    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        let store = engine.store
        // Static like the web map, so it never traps the page scroll.
        Map(position: $camera, interactionModes: []) {
            if store.points.count > 1 {
                MapPolyline(coordinates: store.points.map(\.coordinate))
                    .stroke(Color(hex: 0xBD684B), style: StrokeStyle(lineWidth: 3, lineCap: .butt, dash: [4, 5]))
            }
            ForEach(store.stops) { stop in
                Annotation("", coordinate: stop.coordinate) {
                    ZStack {
                        Rectangle().fill(Color(hex: 0xFAF4DE)).frame(width: 12, height: 12)
                            .overlay(Rectangle().strokeBorder(Color(hex: 0x38483D), lineWidth: 2))
                        Rectangle().fill(Color(hex: 0xBD684B)).frame(width: 4, height: 4)
                    }
                }
            }
            UserAnnotation()
        }
        .mapStyle(.standard(emphasis: .muted, pointsOfInterest: .excludingAll))
        .environment(\.colorScheme, .light)
        .onChange(of: store.stops.count) { camera = .automatic }
    }
}

// MARK: 02 / THE LITTLE MOMENTS

private struct FitPanel: View {
    @Environment(DayEngine.self) private var engine
    @State private var pick: PhotosPickerItem?

    var body: some View {
        let fit = engine.fit
        Panel(eyebrow: "02 / THE LITTLE MOMENTS", title: "What did today look like?",
              trailing: fit.sprite != nil ? "1 / 1 COLLECTED" : nil) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Start with your fit. We'll turn it into the walking character for your world. Skip it and you get a stand-in explorer.")
                    .font(Theme.body(12)).lineSpacing(4).foregroundStyle(Theme.muted)

                PhotosPicker(selection: $pick, matching: .images) {
                    HStack(spacing: 14) {
                        ZStack(alignment: .topTrailing) {
                            Group {
                                if let preview = fit.preview {
                                    Image(uiImage: preview).resizable().interpolation(.none).scaledToFill()
                                } else {
                                    Text("\u{265F}\u{FE0E}").font(.system(size: 40, design: .serif)).foregroundStyle(Color(hex: 0xBB835E))
                                }
                            }
                            .frame(width: 92, height: 110).clipped()
                            .background(Color(hex: 0xF8F7EE))
                            .overlay(Rectangle().strokeBorder(Color(hex: 0xD9DDCA), lineWidth: 1))
                            Text(fit.uploadURL != nil ? "✓" : "")
                                .font(Theme.mono(10)).foregroundStyle(.white)
                                .frame(width: 13, height: 13)
                                .background(fit.uploadURL != nil ? Color(hex: 0x6E8558) : Theme.panel)
                                .overlay(Rectangle().strokeBorder(Color(hex: 0xB6C0A5), lineWidth: 1))
                                .padding(6)
                        }
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Today's fit").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink)
                            Text("Full body · front view").font(Theme.body(10)).foregroundStyle(Theme.muted)
                            Text(fit.busy ? "SAVING…" : fit.preview == nil ? "ADD PHOTO +" : "REPLACE PHOTO +")
                                .font(Theme.mono(9)).foregroundStyle(Theme.ink).padding(.top, 6)
                        }
                        Spacer(minLength: 0)
                    }
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

                HStack(spacing: 14) {
                    if let sprite = fit.sprite {
                        Image(uiImage: sprite).resizable().interpolation(.none).scaledToFit().frame(width: 40, height: 60)
                    } else {
                        Text("\u{265F}\u{FE0E}").font(.system(size: 36, design: .serif)).foregroundStyle(Color(hex: 0x8D9B76)).frame(width: 40)
                    }
                    VStack(alignment: .leading, spacing: 5) {
                        Text(fit.busy ? "Stitching your outfit into pixels…" : fit.sprite != nil ? "Your character is ready." : "Every adventure starts with you.")
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.ink)
                        Text(fit.error ?? (fit.sprite != nil ? "They'll walk your world tonight." : "Add a front fit photo to create your character."))
                            .font(Theme.body(10)).foregroundStyle(fit.error != nil ? Theme.error : Theme.muted)
                    }
                    Spacer(minLength: 0)
                    if fit.busy { ProgressView().tint(Theme.green) }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(hex: 0xF0F1E4))
                .overlay(Rectangle().strokeBorder(Color(hex: 0xCED5BC), style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
            }
        }
    }
}

// MARK: 03 / WHEN THE DAY ENDS

private struct DayEndPanel: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        @Bindable var engine = engine
        Panel(eyebrow: "03 / WHEN THE DAY ENDS", title: "We'll build it for you.",
              trailing: engine.autoGenerate ? "AUTO · \(engine.endOfDay.formatted(date: .omitted, time: .shortened))" : "MANUAL") {
            VStack(alignment: .leading, spacing: 14) {
                Text("When the day ends, your stops become a little world, and you get a notification when it's ready to walk.")
                    .font(Theme.body(12)).lineSpacing(4).foregroundStyle(Theme.muted)
                Toggle(isOn: $engine.autoGenerate) {
                    Text("Build my day automatically").font(Theme.body(12)).foregroundStyle(Theme.ink)
                }
                .tint(Theme.green)
                Eyebrow(text: "DEMO").padding(.top, 4)
                HStack(spacing: 8) {
                    SmallButton(title: "Load demo day") { Task { await engine.store.seedDemo(animated: false) } }
                    SmallButton(title: "Replay live") { Task { await engine.store.seedDemo(animated: true) } }
                }
                HStack(spacing: 8) {
                    SmallButton(title: "End day in 8 s") { engine.endDaySoon() }
                    SmallButton(title: "Start fresh") { engine.clearResult() }
                }
                Text("THE DEMO TRACE IS THE SATURDAY IN DATA/INPUT.JSON, REPLAYED ONTO TODAY")
                    .font(Theme.mono(7)).tracking(0.6).foregroundStyle(Color(hex: 0x939782))
            }
        }
    }
}

// MARK: Finish

private struct Finish: View {
    @Environment(DayEngine.self) private var engine

    var body: some View {
        let store = engine.store
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 10) {
                Eyebrow(text: "ALL THE LITTLE PIECES, ONE LITTLE WORLD.")
                Text("Ready to call it a day?").font(Theme.display(27)).foregroundStyle(Theme.ink)
                Text(message).font(Theme.body(12)).lineSpacing(4).foregroundStyle(Theme.muted)
            }
            if let id = engine.generatedId {
                EndButton(title: "PLAY TODAY") { engine.presentedDayId = id }
            } else {
                EndButton(title: engine.running ? "BUILDING YOUR WORLD…" : "END MY DAY",
                          enabled: !engine.running && !store.stops.isEmpty && !engine.fit.busy) {
                    Task { await engine.generate() }
                }
            }
        }
        .padding(.vertical, 12)
    }

    private var message: String {
        if engine.generatedId != nil { return "Your world is ready. Walk it, then share the link." }
        if engine.running { return "Building your world. This can take a minute." }
        if engine.store.stops.isEmpty { return "Your stops will appear above as you move through the day." }
        if engine.fit.busy { return "Your character is being created. This can take a minute." }
        return "\(engine.store.stops.count) stops so far. End the day now, or let it build at \(engine.endOfDay.formatted(date: .omitted, time: .shortened))."
    }
}

private struct Footer: View {
    var body: some View {
        HStack {
            Text("MADE OF THE LITTLE THINGS.")
            Spacer()
            Text("DAYQUEST / A PLACE OF YOUR OWN")
        }
        .font(Theme.mono(7)).tracking(0.6).foregroundStyle(Color(hex: 0x929783))
        .padding(.vertical, 22)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
}
