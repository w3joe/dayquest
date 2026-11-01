import CoreLocation
import Foundation

/// One raw fix from Core Location (or the demo trace).
struct TracePoint: Codable, Identifiable, Hashable {
    enum Source: String, Codable { case visit, significant, live, demo }

    var id = UUID()
    var lat: Double
    var lng: Double
    var at: Date
    var departure: Date?
    var accuracy: Double
    var source: Source
    /// Demo points carry their own label; real ones are reverse geocoded.
    var label: String?

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
    var location: CLLocation { .init(latitude: lat, longitude: lng) }
}

/// A place the user stayed, built from clustered points. This is what the pipeline gets.
struct Stop: Identifiable, Hashable {
    var id: UUID
    var lat: Double
    var lng: Double
    var arrival: Date
    var label: String

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
}

/// What gets persisted for one calendar day.
struct DayFile: Codable {
    var date: String
    var points: [TracePoint] = []
    var labels: [String: String] = [:]
    var generatedId: String?
    /// Fit check for /api/upload + /api/fit-check; asset URLs are tied to this session id.
    var sessionId: String?
    var fitURL: String?
    var spriteURL: String?
}

/// §6.1 generating-log event streamed from /api/generate-day.
struct GenerateEvent: Decodable, Identifiable {
    let id = UUID()
    let step: String
    let label: String
    let thumb: String?
    let dayId: String?

    enum CodingKeys: String, CodingKey { case step, label, thumb, dayId = "id" }
}

enum DayFormat {
    static let date: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let time: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB_POSIX")
        f.dateFormat = "HH:mm"
        return f
    }()
}
