import SwiftUI
import ExpoModulesCore
import ExpoUI

// MARK: - Props

public final class ScalableTextProps: UIBaseViewProps {
  @Field var text: String = ""
  @Field var fontSize: CGFloat = 14
  @Field var fontWeight: String = "regular"
  @Field var color: String?
  @Field var minScale: CGFloat = 1.0
  @Field var maxLines: Int = 0
  @Field var monoDigits: Bool = false
  @Field var alignment: String = "leading"
}

// MARK: - View

public struct ScalableTextView: ExpoSwiftUI.View {
  @ObservedObject public var props: ScalableTextProps

  public init(props: ScalableTextProps) {
    self.props = props
  }

  public var body: some View {
    let weight = parseWeight(props.fontWeight)
    var text = Text(props.text)
      .font(.system(size: props.fontSize, weight: weight))

    if props.monoDigits {
      text = text.monospacedDigit()
    }

    if let colorHex = props.color {
      text = text.foregroundColor(Color(hex: colorHex))
    }

    return text
      .lineLimit(props.maxLines > 0 ? props.maxLines : nil)
      .minimumScaleFactor(props.minScale)
      .multilineTextAlignment(parseAlignment(props.alignment))
  }

  private func parseWeight(_ w: String) -> Font.Weight {
    switch w {
    case "bold": return .bold
    case "semibold": return .semibold
    case "medium": return .medium
    case "light": return .light
    case "thin": return .thin
    case "heavy": return .heavy
    case "black": return .black
    case "ultraLight": return .ultraLight
    default: return .regular
    }
  }

  private func parseAlignment(_ a: String) -> TextAlignment {
    switch a {
    case "center": return .center
    case "trailing": return .trailing
    default: return .leading
    }
  }
}
