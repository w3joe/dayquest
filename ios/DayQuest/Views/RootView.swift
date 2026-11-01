import SwiftUI

struct RootView: View {
    @Environment(DayEngine.self) private var engine
    @State private var showSettings = false

    var body: some View {
        @Bindable var engine = engine
        NavigationStack {
            TodayView()
                .toolbarBackground(Theme.paper, for: .navigationBar)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showSettings = true } label: { Image(systemName: "gearshape.fill") }
                    }
                }
                .navigationDestination(item: $engine.presentedDayId) { id in
                    DayResultView(id: id)
                }
        }
        .tint(Theme.green)
        .sheet(isPresented: $showSettings) { SettingsView() }
        .onAppear { engine.requestNotifications() }
    }
}
