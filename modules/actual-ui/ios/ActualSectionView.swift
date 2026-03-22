import SwiftUI
import ExpoModulesCore
import ExpoUI

// MARK: - Child Marker Props

public final class ActualSectionHeaderProps: ExpoSwiftUI.ViewProps {}
public final class ActualSectionContentProps: ExpoSwiftUI.ViewProps {}

// MARK: - Child Marker Views

public struct ActualSectionHeaderView: ExpoSwiftUI.View {
  @ObservedObject public var props: ActualSectionHeaderProps

  public init(props: ActualSectionHeaderProps) {
    self.props = props
  }

  public var body: some View {
    Children()
  }
}

public struct ActualSectionContentView: ExpoSwiftUI.View {
  @ObservedObject public var props: ActualSectionContentProps

  public init(props: ActualSectionContentProps) {
    self.props = props
  }

  public var body: some View {
    Children()
  }
}

// MARK: - Section Props

public final class ActualSectionProps: UIBaseViewProps {
  @Field var isExpanded: Bool?
  /// Header background color hex (for sticky header opacity)
  @Field var headerBackground: String?
  var onIsExpandedChange = EventDispatcher()
}

// MARK: - Section View

public struct ActualSectionView: ExpoSwiftUI.View {
  @ObservedObject public var props: ActualSectionProps
  @State private var expanded: Bool = true

  public init(props: ActualSectionProps) {
    self.props = props
    _expanded = State(initialValue: props.isExpanded ?? true)
  }

  // Extract child marker views
  private var headerView: ActualSectionHeaderView? {
    props.children?
      .compactMap({ $0.childView as? ActualSectionHeaderView })
      .first
  }

  private var contentView: ActualSectionContentView? {
    props.children?
      .compactMap({ $0.childView as? ActualSectionContentView })
      .first
  }

  public var body: some View {
    Section {
      if expanded {
        contentView
      }
    } header: {
      let bgColor = props.headerBackground.map { Color(hex: $0) } ?? Color.clear
      Button(action: {
        withAnimation(.easeInOut(duration: 0.25)) {
          expanded.toggle()
        }
      }) {
        HStack(spacing: 6) {
          Image(systemName: "chevron.right")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(width: 12)
            .rotationEffect(.degrees(expanded ? 90 : 0))
            .animation(.easeInOut(duration: 0.25), value: expanded)
          if let headerView {
            headerView
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
        .padding(.horizontal, 16)
        .background(bgColor)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .textCase(nil)
      .listRowInsets(EdgeInsets())
    }
    .listSectionSeparator(.hidden, edges: .bottom)
    .onChange(of: expanded) { newValue in
      if props.isExpanded != newValue {
        props.onIsExpandedChange(["isExpanded": newValue])
      }
    }
    .onChange(of: props.isExpanded) { newValue in
      if let newValue, newValue != expanded {
        withAnimation(.easeInOut(duration: 0.25)) {
          expanded = newValue
        }
      }
    }
  }
}
