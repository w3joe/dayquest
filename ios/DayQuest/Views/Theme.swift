import SwiftUI

/// Tokens from the web app's app/globals.css (cozy pastel pixel-art).
enum Theme {
    static let ink = Color(hex: 0x5B4A5F)
    static let muted = Color(hex: 0x97869A)
    static let paper = Color(hex: 0xFFF6EA)
    static let dots = Color(hex: 0xF6DFD0)
    static let panel = Color(hex: 0xFFFDF8)
    static let line = Color(hex: 0xF0DCCD)
    static let edge = Color(hex: 0xECD5DC)
    static let shadow = Color(hex: 0xF3DFE6)
    static let pink = Color(hex: 0xFFC6D9)
    static let hot = Color(hex: 0xFF8FAE)
    static let peach = Color(hex: 0xFFDCC0)
    static let butter = Color(hex: 0xFFF0B8)
    static let mint = Color(hex: 0xC9EFD9)
    static let sky = Color(hex: 0xCAE6F8)
    static let lav = Color(hex: 0xE1D6F7)
    static let ok = Color(hex: 0x4FB37F)
    static let error = Color(hex: 0xD9536F)

    /// Pixelify Sans stand-in.
    static func pixel(_ size: CGFloat) -> Font { .system(size: size, weight: .bold, design: .rounded) }
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font { .system(size: size, weight: weight, design: .monospaced) }
    static func body(_ size: CGFloat = 15, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight) }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// The web app's 64 px pixel sprites (public/ui), drawn without smoothing.
struct Sprite: View {
    var name: String
    var size: CGFloat = 48
    var body: some View {
        Image(name).resizable().interpolation(.none).frame(width: size, height: size)
    }
}

/// Dotted paper background with drifting clouds, like the web app frame.
struct PaperBackground: View {
    @State private var drift = false

    var body: some View {
        ZStack(alignment: .top) {
            Theme.paper
            Canvas { context, size in
                let step: CGFloat = 22
                for x in stride(from: CGFloat(0), through: size.width, by: step) {
                    for y in stride(from: CGFloat(0), through: size.height, by: step) {
                        context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 3, height: 3)), with: .color(Theme.dots))
                    }
                }
            }
            GeometryReader { geo in
                Sprite(name: "cloud", size: 96).opacity(0.9)
                    .offset(x: geo.size.width * 0.04 + (drift ? 40 : 0), y: 70)
                Sprite(name: "cloud", size: 64).opacity(0.9)
                    .offset(x: geo.size.width * 0.72 - (drift ? 40 : 0), y: 30)
            }
        }
        .ignoresSafeArea()
        .onAppear { withAnimation(.easeInOut(duration: 12).repeatForever(autoreverses: true)) { drift = true } }
    }
}

/// `.dq-panel`-style card: rounded, 3 px pastel edge, hard offset shadow.
struct Card<Content: View>: View {
    var tint: Color = Theme.panel
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tint, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Theme.edge, lineWidth: 3))
            .background(RoundedRectangle(cornerRadius: 22).fill(Theme.shadow).offset(x: 4, y: 4))
    }
}

/// Chunky pill button with a pressed-down offset shadow.
struct PillButton: View {
    var title: String
    var color: Color = Theme.hot
    var textColor: Color = .white
    var sprite: String?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let sprite { Sprite(name: sprite, size: 28) }
                Text(title).font(Theme.pixel(19))
            }
            .foregroundStyle(textColor)
            .padding(.vertical, 16).padding(.horizontal, 26)
            .frame(maxWidth: .infinity)
            .background(color, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.ink.opacity(0.12), lineWidth: 3))
        }
        .buttonStyle(PressStyle())
    }
}

struct SmallButton: View {
    var title: String
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(Theme.pixel(14)).foregroundStyle(Theme.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10).padding(.horizontal, 10)
                .background(Color.white, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.edge, lineWidth: 3))
        }
        .buttonStyle(PressStyle())
    }
}

/// Buttons sink into their shadow when pressed.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Capsule().fill(Theme.shadow).offset(x: configuration.isPressed ? 0 : 3, y: configuration.isPressed ? 0 : 3))
            .offset(x: configuration.isPressed ? 3 : 0, y: configuration.isPressed ? 3 : 0)
            .animation(.spring(duration: 0.15), value: configuration.isPressed)
    }
}

/// Little hopping animation used on sprites.
struct Hop: ViewModifier {
    var height: CGFloat = 8
    var duration: Double = 0.6
    @State private var up = false
    func body(content: Content) -> some View {
        content.offset(y: up ? -height : 0)
            .onAppear { withAnimation(.easeInOut(duration: duration).repeatForever(autoreverses: true)) { up = true } }
    }
}

extension View {
    func hop(_ height: CGFloat = 8, duration: Double = 0.6) -> some View { modifier(Hop(height: height, duration: duration)) }
}
