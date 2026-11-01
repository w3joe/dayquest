import SwiftUI

struct RootView: View {
    @Environment(DayEngine.self) private var engine
    @State private var showSettings = false

    var body: some View {
        @Bindable var engine = engine
        NavigationStack {
            TodayView()
                .navigationTitle("DAYQUEST")
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
        .tint(Theme.accent)
        .sheet(isPresented: $showSettings) { SettingsView() }
        .onAppear { engine.requestNotifications() }
    }
}
