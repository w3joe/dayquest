import BackgroundTasks
import Foundation
import Observation
import UIKit
import UserNotifications

/// Owns the end-of-day rule: once the clock passes the chosen end time and today has a trace,
/// the day is generated automatically (on a location wake, a background refresh, or when the
/// app comes to the foreground), then a notification links to the finished map.
@Observable
final class DayEngine {
    static let refreshTask = "app.dayquest.ios.end-of-day"

    let store = TraceStore()
    let recorder: LocationRecorder

    private(set) var log: [GenerateEvent] = []
    private(set) var running = false
    private(set) var failure: String?
    /// Set when a generation finishes; the UI navigates to it.
    var presentedDayId: String?

    var serverURL: String { didSet { UserDefaults.standard.set(serverURL, forKey: "serverURL") } }
    var playerName: String { didSet { UserDefaults.standard.set(playerName, forKey: "playerName") } }
    /// Minutes after midnight.
    var endMinutes: Int { didSet { UserDefaults.standard.set(endMinutes, forKey: "endMinutes"); endOverride = nil; scheduleReminders() } }
    var autoGenerate: Bool { didSet { UserDefaults.standard.set(autoGenerate, forKey: "autoGenerate") } }

    init() {
        let defaults = UserDefaults.standard
        serverURL = defaults.string(forKey: "serverURL") ?? "http://localhost:3000"
        playerName = defaults.string(forKey: "playerName") ?? "LUCAS"
        endMinutes = defaults.object(forKey: "endMinutes") as? Int ?? 21 * 60
        autoGenerate = defaults.object(forKey: "autoGenerate") as? Bool ?? true
        recorder = LocationRecorder(store: store)
        recorder.onPoint = { [weak self] in self?.checkEndOfDay() }
    }

    /// Demo only: an end of day a few seconds away, not persisted.
    private(set) var endOverride: Date?

    var endOfDay: Date {
        if let endOverride { return endOverride }
        return Calendar.current.date(bySettingHour: endMinutes / 60, minute: endMinutes % 60, second: 0, of: Date()) ?? Date()
    }

    var generatedId: String? { store.day.generatedId }

    func dayURL(_ id: String) -> URL? { URL(string: "\(serverURL.trimmingCharacters(in: .init(charactersIn: "/")))/day/\(id)") }

    // MARK: End of day

    func checkEndOfDay() {
        guard autoGenerate, !running, store.day.generatedId == nil, !store.stops.isEmpty, Date() >= endOfDay else { return }
        Task { await generate() }
    }

    /// Demo shortcut: the day "ends" a few seconds from now and the automatic path takes over.
    func endDaySoon(seconds: Int = 8) {
        endOverride = Date().addingTimeInterval(TimeInterval(seconds))
        autoGenerate = true
        Task {
            try? await Task.sleep(for: .seconds(seconds))
            checkEndOfDay()
        }
    }

    // MARK: Generation

    @MainActor
    func generate() async {
        guard !running else { return }
        guard let url = URL(string: "\(serverURL.trimmingCharacters(in: .init(charactersIn: "/")))/api/generate-day") else {
            failure = "Server URL is not valid."
            return
        }
        running = true
        failure = nil
        log = []
        // Keeps the stream alive for a while if the day ended while the app was backgrounded.
        let background = UIApplication.shared.beginBackgroundTask(withName: "generate-day")
        defer {
            running = false
            UIApplication.shared.endBackgroundTask(background)
        }

        var request = URLRequest(url: url, timeoutInterval: 300)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["uploads": [], "day": store.requestDay(name: playerName)])

        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                failure = "Server answered \((response as? HTTPURLResponse)?.statusCode ?? 0)."
                return
            }
            for try await line in bytes.lines {
                guard let event = try? JSONDecoder().decode(GenerateEvent.self, from: Data(line.utf8)) else { continue }
                log.append(event)
                if event.step == "error" { failure = event.label }
                if event.step == "done", let id = event.dayId {
                    store.markGenerated(id)
                    presentedDayId = id
                    notifyReady(id)
                }
            }
        } catch {
            failure = "Could not reach \(serverURL). \(error.localizedDescription)"
        }
    }

    func clearResult() {
        store.reset()
        endOverride = nil
        log = []
        failure = nil
        presentedDayId = nil
    }

    // MARK: Notifications and background refresh

    func requestNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func notifyReady(_ id: String) {
        guard UIApplication.shared.applicationState != .active else { return }
        let content = UNMutableNotificationContent()
        content.title = "Your day is ready"
        content.body = "\(store.stops.count) stops turned into a map you can walk. Tap to play."
        content.userInfo = ["dayId": id]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "ready-\(id)", content: content, trigger: nil))
    }

    func scheduleReminders() {
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshTask)
        request.earliestBeginDate = max(endOfDay, Date().addingTimeInterval(60))
        try? BGTaskScheduler.shared.submit(request)

        // Fallback if iOS never wakes us: a nudge at end of day that opens the app, which then generates.
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["end-of-day"])
        let content = UNMutableNotificationContent()
        content.title = "That's a wrap"
        content.body = "Building today's DayQuest from where you went."
        let parts = DateComponents(hour: endMinutes / 60, minute: endMinutes % 60)
        center.add(UNNotificationRequest(identifier: "end-of-day", content: content,
                                         trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: true)))
    }

    func handleRefresh(_ task: BGAppRefreshTask) {
        scheduleReminders()
        let work = Task { @MainActor in
            if autoGenerate, store.day.generatedId == nil, !store.stops.isEmpty, Date() >= endOfDay { await generate() }
            task.setTaskCompleted(success: failure == nil)
        }
        task.expirationHandler = { work.cancel() }
    }
}
