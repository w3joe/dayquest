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

    struct FitState {
        var preview: UIImage?
        var sprite: UIImage?
        var uploadURL: String?
        var busy = false
        var error: String?
    }

    private(set) var fit = FitState()
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
        serverURL = defaults.string(forKey: "serverURL") ?? "https://devday-hack-ios.shawn404.top"
        playerName = defaults.string(forKey: "playerName") ?? "LUCAS"
        endMinutes = defaults.object(forKey: "endMinutes") as? Int ?? 21 * 60
        autoGenerate = defaults.object(forKey: "autoGenerate") as? Bool ?? true
        recorder = LocationRecorder(store: store)
        recorder.onPoint = { [weak self] in self?.checkEndOfDay() }
        fit.uploadURL = store.day.fitURL
        Task { await loadSprite() }
    }

    /// How far through the day we are, for the progress bar (08:00 → end of day).
    var dayProgress: Double {
        if generatedId != nil { return 1 }
        guard let start = Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date()) else { return 0 }
        let total = endOfDay.timeIntervalSince(start)
        return total > 0 ? min(1, max(0, Date().timeIntervalSince(start) / total)) : 1
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
        request.httpBody = try? JSONSerialization.data(withJSONObject: store.requestBody(name: playerName))

        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                var text = ""
                for try await line in bytes.lines { text += line }
                let message = (try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])?["error"] as? String
                failure = message ?? "Server answered \((response as? HTTPURLResponse)?.statusCode ?? 0)."
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
        fit = FitState()
        endOverride = nil
        log = []
        failure = nil
        presentedDayId = nil
    }

    // MARK: Fit check (same endpoints as the web Today screen)

    private func url(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        return URL(string: serverURL.trimmingCharacters(in: .init(charactersIn: "/")) + path)
    }

    @MainActor
    func makeCharacter(from data: Data) async {
        guard let image = UIImage(data: data), let jpeg = Self.jpeg(image) else {
            fit.error = "Choose a JPEG, PNG or HEIC photo."
            return
        }
        let sessionId = store.day.sessionId ?? UUID().uuidString.lowercased()
        fit = FitState(preview: Self.pixelPreview(image), busy: true)
        do {
            let upload = try await postPhoto("/api/upload", jpeg: jpeg, fields: ["kind": "fit", "sessionId": sessionId], key: "url")
            fit.uploadURL = upload
            store.setFit(sessionId: sessionId, fitURL: upload, spriteURL: nil)
            let sprite = try await postPhoto("/api/fit-check", jpeg: jpeg, fields: ["sessionId": sessionId], key: "spriteUrl")
            store.setFit(sessionId: sessionId, fitURL: upload, spriteURL: sprite)
            await loadSprite()
        } catch {
            fit.error = error.localizedDescription
        }
        fit.busy = false
    }

    @MainActor
    private func loadSprite() async {
        guard let path = store.day.spriteURL, let url = url(path),
              let (data, _) = try? await URLSession.shared.data(from: url) else { return }
        fit.sprite = UIImage(data: data)
    }

    private func postPhoto(_ path: String, jpeg: Data, fields: [String: String], key: String) async throws -> String {
        guard let url = url(path) else { throw DayError("Server URL is not valid.") }
        let boundary = UUID().uuidString
        var body = Data()
        for (name, value) in fields {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"fit.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpeg)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        var request = URLRequest(url: url, timeoutInterval: 180)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.upload(for: request, from: body)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (response as? HTTPURLResponse)?.statusCode == 200, let value = json?[key] as? String else {
            throw DayError(json?["error"] as? String ?? "Could not reach the server. Please try again.")
        }
        return value
    }

    /// The server takes ≤ 4 MB; 1600 px JPEG keeps well under that.
    private static func jpeg(_ image: UIImage) -> Data? {
        let scale = min(1, 1600 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        return UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
            .jpegData(compressionQuality: 0.85)
    }

    /// Same idea as the web preview: shrink to 96 px, shown with nearest-neighbour scaling.
    private static func pixelPreview(_ image: UIImage) -> UIImage {
        let scale = 96 / max(image.size.width, image.size.height)
        let size = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
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

struct DayError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
