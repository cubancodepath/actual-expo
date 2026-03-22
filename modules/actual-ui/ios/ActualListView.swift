import SwiftUI
import ExpoModulesCore
import ExpoUI

// MARK: - Props

public final class ActualListProps: UIBaseViewProps {
  /// List visual style: "plain" (edge-to-edge) or "insetGrouped" (card-style sections)
  @Field var listStyleType: String = "plain"
  /// Tint color hex (affects refresh spinner, accent elements)
  @Field var listTintColor: String?
  /// Section spacing in points (default: system default, 0 = compact)
  @Field var sectionSpacing: Double = -1
}

// MARK: - View

public struct ActualListView: ExpoSwiftUI.View {
  @ObservedObject public var props: ActualListProps

  public init(props: ActualListProps) {
    self.props = props
  }

  public var body: some View {
    let tintColor = props.listTintColor.map { Color(hex: $0) }
    let _ = {
      if let hex = props.listTintColor {
        UIRefreshControl.appearance().tintColor = UIColor(Color(hex: hex))
      }
    }()

    if #available(iOS 17.0, *) {
      listForStyle
        .scrollContentBackground(.hidden)
        .tint(tintColor)
        .listSectionSpacing(props.sectionSpacing >= 0 ? .custom(props.sectionSpacing) : .default)
    } else if #available(iOS 16.0, *) {
      listForStyle
        .scrollContentBackground(.hidden)
        .tint(tintColor)
    } else {
      listForStyle
        .tint(tintColor)
    }
  }

  @ViewBuilder
  private var listForStyle: some View {
    switch props.listStyleType {
    case "insetGrouped":
      List { Children() }.listStyle(.insetGrouped)
    case "grouped":
      List { Children() }.listStyle(.grouped)
    default:
      List { Children() }.listStyle(.plain)
    }
  }
}
