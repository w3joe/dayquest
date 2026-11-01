import CoreLocation
import Foundation
import Observation

/// Records the day in the background. Visits and significant-location changes are cheap and
/// relaunch the app after it is killed; "detailed" adds continuous GPS (50 m filter) on top.
@Observable
final class LocationRecorder: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private let store: TraceStore
    /// Called after every new point so the end-of-day check runs even while backgrounded.
    var onPoint: (() -> Void)?

    private(set) var authorization: CLAuthorizationStatus
    private(set) var lastError: String?

    var isRecording: Bool {
        didSet { UserDefaults.standard.set(isRecording, forKey: "recording"); apply() }
    }

    var detailed: Bool {
        didSet { UserDefaults.standard.set(detailed, forKey: "detailed"); apply() }
    }

    init(store: TraceStore) {
        self.store = store
        authorization = manager.authorizationStatus
        isRecording = UserDefaults.standard.bool(forKey: "recording")
        detailed = UserDefaults.standard.bool(forKey: "detailed")
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 50
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = true
        apply()
    }

    var hasAlways: Bool { authorization == .authorizedAlways }

    var permissionText: String {
        switch authorization {
        case .authorizedAlways: "ALWAYS"
        case .authorizedWhenInUse: "WHILE USING (UPGRADE TO ALWAYS)"
        case .denied, .restricted: "DENIED (OPEN SETTINGS)"
        default: "NOT ASKED"
        }
    }

    func requestAlways() {
        // iOS asks for When In Use first, then offers Always later (or on this second call).
        if authorization == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestAlwaysAuthorization()
        }
    }

    private func apply() {
        guard isRecording, authorization == .authorizedAlways || authorization == .authorizedWhenInUse else {
            manager.stopMonitoringVisits()
            manager.stopMonitoringSignificantLocationChanges()
            manager.stopUpdatingLocation()
            return
        }
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = detailed
        manager.startMonitoringVisits()
        manager.startMonitoringSignificantLocationChanges()
        if detailed { manager.startUpdatingLocation() } else { manager.stopUpdatingLocation() }
    }

    // MARK: CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        if authorization == .authorizedWhenInUse { manager.requestAlwaysAuthorization() }
        apply()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let source: TracePoint.Source = detailed ? .live : .significant
        for location in locations where location.horizontalAccuracy >= 0 && location.horizontalAccuracy < 500 {
            if let last = store.points.last, last.source != .visit,
               last.location.distance(from: location) < 25, location.timestamp.timeIntervalSince(last.at) < 120 { continue }
            store.append(TracePoint(lat: location.coordinate.latitude, lng: location.coordinate.longitude,
                                    at: location.timestamp, accuracy: location.horizontalAccuracy, source: source))
        }
        onPoint?()
    }

    func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        guard visit.arrivalDate != .distantPast else { return }
        let departure = visit.departureDate == .distantFuture ? nil : visit.departureDate
        store.append(TracePoint(lat: visit.coordinate.latitude, lng: visit.coordinate.longitude, at: visit.arrivalDate,
                                departure: departure, accuracy: visit.horizontalAccuracy, source: .visit))
        onPoint?()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        lastError = error.localizedDescription
    }
}
