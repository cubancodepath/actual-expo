import SwiftUI
import ExpoModulesCore
import ExpoUI

// MARK: - Toolbar Button Config

struct ToolbarButtonConfig: Record {
  @Field var label: String?
  @Field var systemImage: String?
}

// MARK: - Props

public final class ActualNavigationStackProps: UIBaseViewProps {
  @Field var title: String?
  @Field var largeTitleEnabled: Bool = true
  @Field var backgroundColor: String?
  /// Accent/tint color hex (buttons, spinner)
  @Field var tintColor: String?
  @Field var trailingButtons: [ToolbarButtonConfig] = []
  var onTrailingButtonPress = EventDispatcher()
}

// MARK: - Child markers for toolbar content

public final class NavTrailingProps: ExpoSwiftUI.ViewProps {}
public struct NavTrailingView: ExpoSwiftUI.View {
  @ObservedObject public var props: NavTrailingProps
  public init(props: NavTrailingProps) { self.props = props }
  public var body: some View { Children() }
}

public final class NavContentProps: ExpoSwiftUI.ViewProps {}
public struct NavContentView: ExpoSwiftUI.View {
  @ObservedObject public var props: NavContentProps
  public init(props: NavContentProps) { self.props = props }
  public var body: some View { Children() }
}

// MARK: - View

public struct ActualNavigationStackView: ExpoSwiftUI.View {
  @ObservedObject public var props: ActualNavigationStackProps
  @Environment(\.colorScheme) private var colorScheme

  public init(props: ActualNavigationStackProps) {
    self.props = props
  }

  private var contentView: NavContentView? {
    props.children?
      .compactMap({ $0.childView as? NavContentView })
      .first
  }

  private var trailingView: NavTrailingView? {
    props.children?
      .compactMap({ $0.childView as? NavTrailingView })
      .first
  }

  // Fallback: if no child markers, use Children() directly
  private var mainContent: some View {
    Group {
      if let contentView {
        contentView
      } else {
        Children()
      }
    }
  }

  public var body: some View {
    let bgColor = props.backgroundColor.map { Color(hex: $0) }

    if #available(iOS 16.0, *) {
      NavigationStack {
        mainContent
          .navigationTitle(props.title ?? "")
          .navigationBarTitleDisplayMode(props.largeTitleEnabled ? .large : .inline)
          .toolbarBackground(.automatic, for: .navigationBar)
          .toolbarColorScheme(colorScheme, for: .navigationBar)
          .scrollContentBackground(.hidden)
          .background(bgColor ?? Color.clear)
          .toolbar {
            if let trailingView {
              ToolbarItemGroup(placement: .topBarTrailing) {
                trailingView
              }
            }
          }
      }
      .tint(props.tintColor.map { Color(hex: $0) } ?? Color.accentColor)
    } else {
      NavigationView {
        mainContent
          .navigationTitle(props.title ?? "")
          .navigationBarTitleDisplayMode(props.largeTitleEnabled ? .large : .inline)
          .background(bgColor ?? Color.clear)
      }
      .navigationViewStyle(.stack)
    }
  }
}
