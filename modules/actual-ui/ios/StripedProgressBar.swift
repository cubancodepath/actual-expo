import SwiftUI
import ExpoModulesCore
import ExpoUI

// MARK: - Props

public final class StripedProgressBarProps: UIBaseViewProps {
  /// Spent portion 0-1 (darker layer with stripes)
  @Field var spent: Double = 0
  /// Available/funded portion 0-1 (lighter solid layer)
  @Field var available: Double = 0
  /// Bar color as hex string (e.g. "#10B981")
  @Field var color: String = "#888888"
  /// Whether the category is overspent (full bar)
  @Field var overspent: Bool = false
  /// Whether to show diagonal stripes on spent portion
  @Field var striped: Bool = true
  /// Bar height in points
  @Field var barHeight: Double = 6
}

// MARK: - View

public struct StripedProgressBarView: ExpoSwiftUI.View {
  @ObservedObject public var props: StripedProgressBarProps

  public init(props: StripedProgressBarProps) {
    self.props = props
  }

  public var body: some View {
    let barColor = Color(hex: props.color)
    let spentRatio = props.overspent ? 1.0 : min(max(props.spent, 0), 1)
    let availableRatio = props.overspent ? 1.0 : min(max(props.available, 0), 1)
    let h = CGFloat(props.barHeight)

    GeometryReader { geo in
      let w = geo.size.width
      let r = h / 2  // corner radius = half height for capsule ends

      ZStack(alignment: .leading) {
        // Background track (fully rounded)
        Capsule()
          .fill(Color.gray.opacity(0.15))
          .frame(width: w, height: h)

        // Available/funded layer — left rounded, right flat unless full
        if availableRatio > 0 {
          BarSegment(leftRadius: r, rightRadius: availableRatio >= 1.0 ? r : 0)
            .fill(barColor)
            .frame(width: w * availableRatio, height: h)
        }

        // Spent layer — left rounded, right flat unless full
        if spentRatio > 0 {
          let shape = BarSegment(leftRadius: r, rightRadius: spentRatio >= 1.0 ? r : 0)
          if props.striped {
            shape
              .fill(barColor.opacity(0.6))
              .frame(width: w * spentRatio, height: h)
              .overlay(
                StripedPattern()
                  .fill(Color.black.opacity(0.5))
                  .clipShape(shape)
                  .frame(width: w * spentRatio, height: h),
                alignment: .leading
              )
          } else {
            shape
              .fill(barColor)
              .frame(width: w * spentRatio, height: h)
              .overlay(
                shape.fill(Color.black.opacity(0.25)).frame(width: w * spentRatio, height: h)
              )
          }
        }
      }
    }
    .frame(height: CGFloat(props.barHeight))
    .animation(.easeInOut(duration: 0.4), value: props.spent)
    .animation(.easeInOut(duration: 0.4), value: props.available)
  }
}

// MARK: - Bar Segment Shape (left rounded, right flat or rounded)

struct BarSegment: Shape {
  let leftRadius: CGFloat
  let rightRadius: CGFloat

  func path(in rect: CGRect) -> Path {
    var path = Path()
    let lr = min(leftRadius, rect.height / 2)
    let rr = min(rightRadius, rect.height / 2)

    path.move(to: CGPoint(x: lr, y: 0))
    path.addLine(to: CGPoint(x: rect.width - rr, y: 0))
    if rr > 0 {
      path.addArc(center: CGPoint(x: rect.width - rr, y: rr), radius: rr, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
      path.addArc(center: CGPoint(x: rect.width - rr, y: rect.height - rr), radius: rr, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
    } else {
      path.addLine(to: CGPoint(x: rect.width, y: 0))
      path.addLine(to: CGPoint(x: rect.width, y: rect.height))
    }
    path.addLine(to: CGPoint(x: lr, y: rect.height))
    path.addArc(center: CGPoint(x: lr, y: rect.height - lr), radius: lr, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
    path.addArc(center: CGPoint(x: lr, y: lr), radius: lr, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
    path.closeSubpath()

    return path
  }
}

// MARK: - Striped Pattern

struct StripedPattern: Shape {
  let spacing: CGFloat = 4
  let angle: CGFloat = 45

  func path(in rect: CGRect) -> Path {
    var path = Path()
    let step = spacing
    let radians = angle * .pi / 180
    let dx = rect.height / tan(radians)

    var x: CGFloat = -rect.height
    while x < rect.width + rect.height {
      path.move(to: CGPoint(x: x, y: rect.maxY))
      path.addLine(to: CGPoint(x: x + dx, y: rect.minY))
      path.addLine(to: CGPoint(x: x + dx + step / 2, y: rect.minY))
      path.addLine(to: CGPoint(x: x + step / 2, y: rect.maxY))
      path.closeSubpath()
      x += step
    }

    return path
  }
}

// MARK: - Color Extension

extension Color {
  init(hex: String) {
    let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var int: UInt64 = 0
    Scanner(string: hex).scanHexInt64(&int)
    let r, g, b, a: Double
    switch hex.count {
    case 6:
      (r, g, b, a) = (
        Double((int >> 16) & 0xFF) / 255,
        Double((int >> 8) & 0xFF) / 255,
        Double(int & 0xFF) / 255,
        1
      )
    case 8:
      (r, g, b, a) = (
        Double((int >> 24) & 0xFF) / 255,
        Double((int >> 16) & 0xFF) / 255,
        Double((int >> 8) & 0xFF) / 255,
        Double(int & 0xFF) / 255
      )
    default:
      (r, g, b, a) = (0.5, 0.5, 0.5, 1)
    }
    self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
  }
}
