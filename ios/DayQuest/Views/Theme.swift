import SwiftUI

/// Tokens from the web app's app/globals.css (`--ink`, `--paper`, `.dq-panel`, …).
enum Theme {
    static let ink = Color(hex: 0x34483D)
    static let muted = Color(hex: 0x7B8170)
    static let paper = Color(hex: 0xF6F3E8)
    static let panel = Color(hex: 0xFFFCF2)
    static let line = Color(hex: 0xD9DAC9)
    static let panelEdge = Color(hex: 0xCFD2BF)
    static let shadow = Color(hex: 0xE4E4D5)
    static let rivet = Color(hex: 0xB8C0A8)
    static let green = Color(hex: 0x416348)
    static let orange = Color(hex: 0xB96745)
    static let chip = Color(hex: 0xEDF0DE)
    static let chipText = Color(hex: 0x55724C)
    static let tick = Color(hex: 0x71875C)
    static let error = Color(hex: 0xA14235)

    /// DM Mono stand-in.
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    /// Pixelify Sans stand-in for headings.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .rounded)
    }

    static func body(_ size: CGFloat = 14) -> Font { .system(size: size) }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// `.dq-eyebrow`
struct Eyebrow: View {
    var text: String
    var color = Theme.muted
    var body: some View {
        Text(text).font(Theme.mono(10)).tracking(1.3).foregroundStyle(color)
    }
}

/// `.dq-panel`: cream card, hairline border, offset shadow and two corner rivets.
struct Panel<Content: View>: View {
    var eyebrow: String
    var title: String
    var trailing: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(text: eyebrow)
                    Text(title).font(Theme.display(22)).foregroundStyle(Theme.ink)
                }
                Spacer(minLength: 0)
                if let trailing { StatusChip(text: trailing) }
            }
            content.padding(.top, 18)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.panel)
        .overlay(Rectangle().strokeBorder(Theme.panelEdge, lineWidth: 1))
        .overlay(alignment: .topLeading) { Rectangle().fill(Theme.rivet).frame(width: 5, height: 5).padding(5) }
        .overlay(alignment: .topTrailing) { Rectangle().fill(Theme.rivet).frame(width: 5, height: 5).padding(5) }
        .background(Rectangle().fill(Theme.shadow).offset(x: 3, y: 3))
    }
}

/// `.dq-status`
struct StatusChip: View {
    var text: String
    var body: some View {
        HStack(spacing: 7) {
            Rectangle().fill(Color(hex: 0x6C8758)).frame(width: 6, height: 6)
            Text(text).font(Theme.mono(9)).tracking(0.7)
        }
        .foregroundStyle(Theme.chipText)
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(Theme.chip)
        .overlay(Rectangle().strokeBorder(Color(hex: 0xD1D8BF), lineWidth: 1))
        .fixedSize()
    }
}

/// `.dq-end-button`
struct EndButton: View {
    var title: String
    var enabled = true
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title)
                Spacer()
                Text("→")
            }
            .font(Theme.mono(13)).tracking(1)
            .foregroundStyle(Color(hex: 0xFAF6E7))
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(enabled ? Theme.green : Color(hex: 0x9DA98C))
            .overlay(Rectangle().strokeBorder(Color(hex: 0x304C34), lineWidth: 1))
            .background(Rectangle().fill(Color(hex: 0xC0C9AE)).offset(x: 4, y: 4))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

/// `.dq-small-button`
struct SmallButton: View {
    var title: String
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(Theme.mono(10)).foregroundStyle(Theme.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9).padding(.horizontal, 8)
                .background(Color(hex: 0xFAF8ED))
                .overlay(Rectangle().strokeBorder(Color(hex: 0xB7C0A5), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
