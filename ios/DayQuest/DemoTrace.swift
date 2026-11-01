import Foundation

/// The SPEC §3 Saturday (same stops as data/input.json), replayed onto today's date.
enum DemoTrace {
    private static let stops: [(String, Double, Double, String)] = [
        ("10:00", 51.5007, -0.1246, "Elizabeth Tower / Parliament Square"),
        ("10:25", 51.5009, -0.1220, "Westminster Bridge"),
        ("10:45", 51.5033, -0.1196, "London Eye"),
        ("12:05", 51.5010, -0.1260, "Parliament Square bus stop"),
        ("12:18", 51.5080, -0.1281, "Trafalgar Square (bus 24)"),
        ("12:30", 51.5163, -0.1303, "Tottenham Court Road Station"),
        ("12:40", 51.5157, -0.1281, "Kanada-Ya, 64 St Giles High St"),
        ("13:40", 51.5165, -0.1310, "Tottenham Court Road Station"),
        ("13:50", 51.5152, -0.1419, "Oxford Circus Station"),
        ("14:00", 51.5234, -0.1466, "Regent's Park Station"),
        ("14:15", 51.5262, -0.1530, "Queen Mary's Rose Garden"),
        ("14:50", 51.5273, -0.1560, "Triton Fountain"),
        ("15:20", 51.5250, -0.1590, "Boating Lake"),
    ]

    static func points(on day: Date) -> [TracePoint] {
        let calendar = Calendar.current
        return stops.compactMap { t, lat, lng, label in
            let parts = t.split(separator: ":").compactMap { Int($0) }
            guard let at = calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day) else { return nil }
            return TracePoint(lat: lat, lng: lng, at: at, accuracy: 10, source: .demo, label: label)
        }
    }
}
