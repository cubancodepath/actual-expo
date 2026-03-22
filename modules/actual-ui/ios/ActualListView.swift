import SwiftUI
import ExpoModulesCore
import ExpoUI

// MARK: - Props

public final class ActualListProps: UIBaseViewProps {
  /// List visual style: "plain" (edge-to-edge) or "insetGrouped" (card-style sections)
  @Field var listStyleType: String = "plain"
}

// MARK: - View

public struct ActualListView: ExpoSwiftUI.View {
  @ObservedObject public var props: ActualListProps

  public init(props: ActualListProps) {
    self.props = props
  }

  public var body: some View {
    listContent
  }

  @ViewBuilder
  private var listContent: some View {
    if #available(iOS 16.0, *) {
      listForStyle.scrollContentBackground(.hidden)
    } else {
      listForStyle
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
