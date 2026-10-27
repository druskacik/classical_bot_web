// Usage: swift -module-cache-path /tmp/classicalbot-swift-cache scripts/generate-business-cards.swift /path/PlayfairDisplay.ttf /path/Lato-Regular.ttf
// Run from the repository root. Fonts: Google Fonts, SIL Open Font License.
import Foundation
import CoreText
import CoreGraphics
import CoreImage

let output = "public/brand/business-cards"
let ink = "#111827", secondary = "#4B5563", blue = "#2563EB", rule = "#D1D5DB"
func number(_ v: CGFloat) -> String { String(format: "%.3f", Double(v)) }
func font(_ file: String, _ size: CGFloat) -> CTFont {
    let provider = CGDataProvider(url: URL(fileURLWithPath: file) as CFURL)!
    return CTFontCreateWithGraphicsFont(CGFont(provider)!, size, nil, nil)
}
func escaped(_ s: String) -> String {
    s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: "\"", with: "&quot;")
}
func text(_ value: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, serif: Bool = false, fill: String = "#111827", center: Bool = false) -> String {
    let f = font(CommandLine.arguments[serif ? 1 : 2], size)
    let attr = NSAttributedString(string: value, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): f])
    let line = CTLineCreateWithAttributedString(attr)
    let width = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    var d = ""
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let count = CTRunGetGlyphCount(run)
        var glyphs = [CGGlyph](repeating: 0, count: count)
        var positions = [CGPoint](repeating: .zero, count: count)
        CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
        CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
        for i in 0..<count {
            guard let path = CTFontCreatePathForGlyph(f, glyphs[i], nil) else { continue }
            let px = x + positions[i].x - (center ? width / 2 : 0)
            let py = y - positions[i].y
            func p(_ point: CGPoint) -> String { "\(number(px + point.x)) \(number(py - point.y))" }
            path.applyWithBlock { pointer in
                let e = pointer.pointee
                switch e.type {
                case .moveToPoint: d += "M" + p(e.points[0])
                case .addLineToPoint: d += "L" + p(e.points[0])
                case .addQuadCurveToPoint: d += "Q" + p(e.points[0]) + " " + p(e.points[1])
                case .addCurveToPoint: d += "C" + p(e.points[0]) + " " + p(e.points[1]) + " " + p(e.points[2])
                case .closeSubpath: d += "Z"
                @unknown default: break
                }
            }
        }
    }
    return "<g aria-label=\"\(escaped(value))\"><path fill=\"\(fill)\" d=\"\(d)\"/></g>"
}
func mark(_ x: CGFloat, _ y: CGFloat, _ size: CGFloat, color: String = "#111827") -> String {
    "<g transform=\"translate(\(x) \(y)) scale(\(size / 40))\" fill=\"none\" stroke=\"\(color)\" stroke-linecap=\"round\"><path d=\"M29.5 10.25A13.75 13.75 0 1 0 29.5 28.75\" stroke-width=\"2.25\"/><path d=\"M17.5 14.75H32M15.75 20H34M17.5 25.25H32\" stroke-width=\"1.5\"/></g>"
}
func line(_ x1: Int, _ y1: Int, _ x2: Int, _ y2: Int) -> String {
    "<path d=\"M\(x1) \(y1)H\(x2)\" stroke=\"\(rule)\" stroke-width=\"2\"/>"
}
let variants: [(String, String, String)] = [
    ("01-editorial", "Editorial", mark(58, 68, 62)
        + text("ClassicalBot", 140, 114, 57, serif: true)
        + text("Classical music concerts", 65, 268, 38, serif: true)
        + text("around the world.", 65, 318, 38, serif: true)
        + line(65, 400, 785, 400)
        + text("classicalbot.com", 65, 460, 30, fill: blue)),
    ("02-centered", "Centered", mark(385, 66, 80)
        + text("ClassicalBot", 425, 243, 68, serif: true, center: true)
        + text("Classical music concerts worldwide.", 425, 302, 29, fill: secondary, center: true)
        + line(385, 372, 465, 372)
        + text("classicalbot.com", 425, 450, 30, fill: blue, center: true)),
    ("03-split", "Split", mark(58, 66, 58)
        + text("ClassicalBot", 134, 108, 48, serif: true)
        + line(65, 157, 785, 157)
        + text("Classical music", 65, 268, 45, serif: true)
        + text("concerts worldwide.", 65, 328, 45, serif: true)
        + text("classicalbot.com", 65, 460, 30, fill: blue)
        + "<g transform=\"translate(702 432)\" fill=\"none\" stroke=\"\(blue)\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M0 14H62M48 0L62 14L48 28\"/></g>")
]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
func svg(_ title: String, width: String, height: String, viewBox: String, body: String) -> String {
    """
    <svg xmlns="http://www.w3.org/2000/svg" width="\(width)" height="\(height)" viewBox="\(viewBox)" role="img" aria-labelledby="title desc">
      <title id="title">\(escaped(title))</title>
      <desc id="desc">ClassicalBot business card. Classical music concerts worldwide. classicalbot.com. All lettering is outlined vector artwork.</desc>
      \(body)
    </svg>
    """
}
for (name, title, body) in variants {
    try svg("ClassicalBot — \(title)", width: "85mm", height: "55mm", viewBox: "0 0 850 550", body: "<rect width=\"850\" height=\"550\" fill=\"#FFFFFF\"/>" + body)
        .write(toFile: "\(output)/\(name).svg", atomically: true, encoding: .utf8)
    try svg("ClassicalBot — \(title), 3 mm bleed", width: "91mm", height: "61mm", viewBox: "-30 -30 910 610", body: "<!-- Trim: x=0 y=0 width=850 height=550; units: 10 per mm. -->\n<rect x=\"-30\" y=\"-30\" width=\"910\" height=\"610\" fill=\"#FFFFFF\"/>" + body)
        .write(toFile: "\(output)/\(name)-bleed.svg", atomically: true, encoding: .utf8)
}
var overview = "<rect width=\"1870\" height=\"1870\" fill=\"#F3F4F6\"/>"
overview += text("ClassicalBot", 85, 115, 52, serif: true)
overview += text("Business cards · 85 × 55 mm", 85, 168, 26, fill: secondary)
for (index, variant) in variants.enumerated() {
    let x = index == 2 ? 510 : (index == 1 ? 965 : 55)
    let y = index == 2 ? 1080 : 285
    overview += text(variant.1, CGFloat(x), CGFloat(y - 30), 26, fill: secondary)
    overview += "<g transform=\"translate(\(x) \(y))\"><rect width=\"850\" height=\"550\" fill=\"#FFFFFF\"/>\(variant.2)</g>"
}
try svg("ClassicalBot — three business card variants", width: "1870", height: "1870", viewBox: "0 0 1870 1870", body: overview)
    .write(toFile: "\(output)/overview.svg", atomically: true, encoding: .utf8)
print("Created three outlined cards, three bleed files, and overview.svg in \(output).")

// Additional print explorations. Font weight remains regular throughout.
struct Card {
    let name: String
    let title: String
    let background: String
    let body: String
}
func qr(_ x: CGFloat, _ y: CGFloat, size: CGFloat) -> String {
    let filter = CIFilter(name: "CIQRCodeGenerator")!
    filter.setValue(Data("https://classicalbot.com".utf8), forKey: "inputMessage")
    filter.setValue("M", forKey: "inputCorrectionLevel")
    let image = filter.outputImage!
    let n = Int(image.extent.width)
    var pixels = [UInt8](repeating: 0, count: n * n * 4)
    CIContext(options: [.useSoftwareRenderer: true]).render(image, toBitmap: &pixels, rowBytes: n * 4, bounds: image.extent, format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
    let luminance = stride(from: 0, to: pixels.count, by: 4).map { pixels[$0] }
    precondition(luminance.contains(255) && luminance.contains(0), "QR rendering failed. Run with access to macOS graphics services.")
    // Include an explicit four-module quiet zone on all sides.
    let module = size / CGFloat(n + 8)
    var d = ""
    for row in 0..<n {
        for col in 0..<n where pixels[(row * n + col) * 4] < 128 {
            d += "M\(col + 4) \(n - row + 3)h1v1h-1Z"
        }
    }
    return "<g aria-label=\"QR code: https://classicalbot.com\" transform=\"translate(\(x) \(y))\"><rect width=\"\(size)\" height=\"\(size)\" fill=\"#FFFFFF\"/><path transform=\"scale(\(module))\" d=\"\(d)\" fill=\"\(ink)\" shape-rendering=\"crispEdges\"/></g>"
}
let boldFronts = [
    Card(name: "04-monument", title: "Monument", background: "#FFFFFF", body:
        text("Classical", 58, 228, 164, serif: true)
        + text("Bot", 58, 400, 164, serif: true)
        + mark(610, 277, 168)
        + "<path d=\"M65 448H785\" stroke=\"\(ink)\" stroke-width=\"3\"/>"
        + text("Classical music concerts worldwide.", 65, 491, 25)
    ),
    Card(name: "05-nocturne", title: "Nocturne", background: ink, body:
        mark(452, -41, 407, color: "#FFFFFF")
        + text("ClassicalBot", 65, 401, 86, serif: true, fill: "#FFFFFF")
        + text("Classical music concerts worldwide.", 65, 473, 28, fill: "#FFFFFF")
    ),
    Card(name: "06-programme-blue", title: "Programme blue", background: blue, body:
        mark(57, 53, 67, color: "#FFFFFF")
        + text("ClassicalBot", 144, 104, 45, serif: true, fill: "#FFFFFF")
        + text("The world.", 65, 262, 99, serif: true, fill: "#FFFFFF")
        + text("In concert.", 65, 377, 99, serif: true, fill: "#FFFFFF")
        + "<path d=\"M65 427H785\" stroke=\"#FFFFFF\" stroke-width=\"2\"/>"
        + text("classicalbot.com", 65, 489, 30, fill: "#FFFFFF")
        + "<path d=\"M712 477H780M765 462L780 477L765 492\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"3\"/>"
    )
]
let backs = [
    Card(name: "back-01-contact", title: "Contact only", background: "#FFFFFF", body:
        mark(60, 62, 57)
        + text("info@classicalbot.com", 65, 293, 46)
        + text("classicalbot.com", 65, 478, 29, fill: blue)
    ),
    Card(name: "back-02-discover", title: "Discover + QR", background: "#FFFFFF", body:
        text("Find your", 65, 149, 58, serif: true)
        + text("next concert.", 65, 218, 58, serif: true)
        + text("classicalbot.com", 65, 291, 28, fill: blue)
        + qr(540, 79, size: 245)
        + line(65, 393, 785, 393)
        + text("info@classicalbot.com", 65, 477, 35)
    ),
    Card(name: "back-03-conversation", title: "Conversation", background: "#FFFFFF", body:
        text("Let’s talk", 65, 199, 85, serif: true)
        + text("classical.", 65, 297, 85, serif: true)
        + text("info@classicalbot.com", 65, 410, 35, fill: blue)
        + text("classicalbot.com", 65, 482, 27, fill: secondary)
        + mark(670, 410, 104)
    )
]
for card in boldFronts + backs {
    let background = "<rect x=\"-30\" y=\"-30\" width=\"910\" height=\"610\" fill=\"\(card.background)\"/>"
    let body = background + card.body
    try svg("ClassicalBot — \(card.title)", width: "85mm", height: "55mm", viewBox: "0 0 850 550", body: body)
        .write(toFile: "\(output)/\(card.name).svg", atomically: true, encoding: .utf8)
    // Backgrounds extend to the outer bleed canvas.
    try svg("ClassicalBot — \(card.title), 3 mm bleed", width: "91mm", height: "61mm", viewBox: "-30 -30 910 610", body: "<!-- Trim: x=0 y=0 width=850 height=550; units: 10 per mm. -->" + body)
        .write(toFile: "\(output)/\(card.name)-bleed.svg", atomically: true, encoding: .utf8)
}
var boldOverview = "<rect width=\"2200\" height=\"2200\" fill=\"#F3F4F6\"/>"
boldOverview += "<defs><clipPath id=\"card-trim\"><rect width=\"850\" height=\"550\"/></clipPath></defs>"
boldOverview += text("ClassicalBot", 150, 110, 52, serif: true)
boldOverview += text("Three bolder fronts + three interchangeable backs · 85 × 55 mm", 150, 171, 29, fill: secondary)
for i in 0..<3 {
    let y = 300 + i * 650
    for (x, card) in [(150, boldFronts[i]), (1100, backs[i])] {
        boldOverview += text(card.title, CGFloat(x), CGFloat(y - 30), 27, fill: secondary)
        boldOverview += "<g transform=\"translate(\(x) \(y))\" clip-path=\"url(#card-trim)\"><rect width=\"850\" height=\"550\" fill=\"\(card.background)\"/>\(card.body)</g>"
    }
}
try svg("ClassicalBot — bolder fronts and back options", width: "2200", height: "2200", viewBox: "0 0 2200 2200", body: boldOverview)
    .write(toFile: "\(output)/overview-bold-and-backs.svg", atomically: true, encoding: .utf8)
print("Created three additional fronts, three backs, their bleed files, and overview-bold-and-backs.svg.")
