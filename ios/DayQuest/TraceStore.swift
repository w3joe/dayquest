import CoreLocation
import Foundation
import Observation

/// Today's location trace, persisted to Documents so it survives the app being killed
/// and relaunched in the background by a significant-change or visit event.
@Observable
final class TraceStore {
    private(set) var day: DayFile
    private(set) var stops: [Stop] = []
    private var geocoding: Set<String> = []

    init() {
        day = TraceStore.load(TraceStore.todayKey()) ?? DayFile(date: TraceStore.todayKey())
        rebuildStops()
    }

    var points: [TracePoint] { day.points }
    var isDemo: Bool { day.points.contains { $0.source == .demo } }

    var distanceKm: Double {
        zip(points, points.dropFirst()).reduce(0) { $0 + $1.0.location.distance(from: $1.1.location) } / 1000
    }

    // MARK: Recording

    func append(_ point: TracePoint) {
        rollOverIfNeeded()
        // Visits arrive late (with arrival in the past); keep the trace in time order.
        day.points.append(point)
        day.points.sort { $0.at < $1.at }
        save()
        rebuildStops()
    }

    func markGenerated(_ id: String) {
        day.generatedId = id
        save()
    }

    func reset() {
        day = DayFile(date: TraceStore.todayKey())
        save()
        rebuildStops()
    }

    /// Replaces today with the demo trace. With `animated`, points drip in so the map fills up on stage.
    @MainActor
    func seedDemo(animated: Bool) async {
        reset()
        let points = DemoTrace.points(on: Date())
        guard animated else {
            day.points = points
            save()
            rebuildStops()
            return
        }
        for point in points {
            try? await Task.sleep(for: .milliseconds(900))
            append(point)
        }
    }

    // MARK: Stops

    /// Consecutive points within 100 m merge into one stop. Each stop gets the label of its
    /// first labelled point, or a reverse-geocoded name.
    private func rebuildStops() {
        var clusters: [[TracePoint]] = []
        for point in points {
            if let last = clusters.last?.last, last.location.distance(from: point.location) < 100 {
                clusters[clusters.count - 1].append(point)
            } else {
                clusters.append([point])
            }
        }
        stops = clusters.map { cluster in
            let lat = cluster.map(\.lat).reduce(0, +) / Double(cluster.count)
            let lng = cluster.map(\.lng).reduce(0, +) / Double(cluster.count)
            let label = cluster.compactMap(\.label).first ?? day.labels[TraceStore.key(lat, lng)] ?? "Somewhere"
            return Stop(id: cluster[0].id, lat: lat, lng: lng, arrival: cluster[0].at, label: label)
        }
        geocodeMissing()
    }

    private func geocodeMissing() {
        for stop in stops where stop.label == "Somewhere" {
            let key = TraceStore.key(stop.lat, stop.lng)
            guard day.labels[key] == nil, !geocoding.contains(key) else { continue }
            geocoding.insert(key)
            CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: stop.lat, longitude: stop.lng)) { [weak self] marks, _ in
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.geocoding.remove(key)
                    let mark = marks?.first
                    let name = mark?.areasOfInterest?.first ?? mark?.name ?? mark?.thoroughfare ?? mark?.locality
                    guard let name else { return }
                    self.day.labels[key] = name
                    self.save()
                    self.rebuildStops()
                }
            }
        }
    }

    /// The `day` field for POST /api/generate-day.
    func requestDay(name: String) -> [String: Any] {
        [
            "date": day.date,
            "name": name,
            "locations": stops.map { ["t": DayFormat.time.string(from: $0.arrival), "lat": $0.lat, "lng": $0.lng, "label": $0.label] },
        ]
    }

    // MARK: Persistence

    private func rollOverIfNeeded() {
        let today = TraceStore.todayKey()
        if day.date != today { day = DayFile(date: today) }
    }

    private static func todayKey() -> String { DayFormat.date.string(from: Date()) }
    private static func key(_ lat: Double, _ lng: Double) -> String { String(format: "%.4f,%.4f", lat, lng) }

    private static func url(_ date: String) -> URL {
        URL.documentsDirectory.appending(path: "day-\(date).json")
    }

    private static func load(_ date: String) -> DayFile? {
        guard let data = try? Data(contentsOf: url(date)) else { return nil }
        return try? JSONDecoder().decode(DayFile.self, from: data)
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(day) else { return }
        try? data.write(to: TraceStore.url(day.date), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
