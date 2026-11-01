import SwiftUI

struct SettingsView: View {
    @Environment(DayEngine.self) private var engine
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var engine = engine
        @Bindable var recorder = engine.recorder
        NavigationStack {
            Form {
                Section {
                    TextField("http://192.168.1.20:3000", text: $engine.serverURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                } header: { Text("Server") } footer: {
                    Text("The DayQuest web app. On a phone, use your Mac's LAN address (npm run dev -- -H 0.0.0.0) or the deployed URL.")
                }
                Section("Player") {
                    TextField("Name", text: $engine.playerName).textInputAutocapitalization(.characters)
                }
                Section {
                    DatePicker("Day ends at", selection: endTime, displayedComponents: .hourAndMinute)
                    Toggle("Build my day automatically", isOn: $engine.autoGenerate)
                } footer: {
                    Text("After this time, the next location wake, background refresh or app open sends today's stops to the pipeline and notifies you when the map is ready.")
                }
                Section {
                    LabeledContent("Permission", value: recorder.permissionText)
                    Toggle("Record in background", isOn: $recorder.isRecording)
                    Toggle("Detailed GPS (more battery)", isOn: $recorder.detailed)
                    if let error = recorder.lastError { Text(error).foregroundStyle(.red) }
                } header: { Text("Location") } footer: {
                    Text("Visits and significant changes run all day at little battery cost. Detailed GPS adds a point every 50 m.")
                }
                Section {
                    Button("Start a fresh day", role: .destructive) { engine.clearResult() }
                }
            }
            .navigationTitle("Settings")
            .toolbar { Button("Done") { dismiss() } }
        }
    }

    private var endTime: Binding<Date> {
        Binding {
            Calendar.current.date(bySettingHour: engine.endMinutes / 60, minute: engine.endMinutes % 60, second: 0, of: Date()) ?? Date()
        } set: { date in
            let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
            engine.endMinutes = (parts.hour ?? 21) * 60 + (parts.minute ?? 0)
        }
    }
}
