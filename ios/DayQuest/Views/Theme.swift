import SwiftUI

/// GBA-ish palette shared with the web app's retro screens.
enum Theme {
    static let ink = Color(red: 0.06, green: 0.07, blue: 0.13)
    static let panel = Color(red: 0.11, green: 0.13, blue: 0.22)
    static let edge = Color(red: 0.95, green: 0.95, blue: 0.88)
    static let accent = Color(red: 0.98, green: 0.80, blue: 0.20)
    static let route = Color(red: 0.89, green: 0.20, blue: 0.20)
    static let ok = Color(red: 0.42, green: 0.85, blue: 0.45)

    static func pixel(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

/// A chunky bordered box, like an RPG textbox.
struct QuestCard<Content: View>: View {
    var title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(Theme.pixel(13)).foregroundStyle(Theme.accent)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.panel)
        .overlay(Rectangle().strokeBorder(Theme.edge, lineWidth: 3))
    }
}

struct PixelButton: View {
    var title: String
    var filled = true
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Theme.pixel(15))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(filled ? Theme.ink : Theme.edge)
                .background(filled ? Theme.accent : Theme.panel)
                .overlay(Rectangle().strokeBorder(Theme.edge, lineWidth: 3))
        }
        .buttonStyle(.plain)
    }
}
