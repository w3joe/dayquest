import BackgroundTasks
import SwiftUI
import UserNotifications

@main
struct DayQuestApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(delegate.engine)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { delegate.engine.checkEndOfDay() }
        }
    }
}

/// The engine lives on the delegate so a background relaunch (significant change, visit,
/// refresh task) restarts recording before any UI exists.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let engine = DayEngine()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        BGTaskScheduler.shared.register(forTaskWithIdentifier: DayEngine.refreshTask, using: nil) { [engine] task in
            engine.handleRefresh(task as! BGAppRefreshTask)
        }
        engine.scheduleReminders()
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let id = response.notification.request.content.userInfo["dayId"] as? String
        await MainActor.run {
            if let id { engine.presentedDayId = id } else { engine.checkEndOfDay() }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner]
    }
}
