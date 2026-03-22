import SwiftUI
import ExpoModulesCore
import ExpoUI

// MARK: - Props

public final class MonthCarouselProps: UIBaseViewProps {
  @Field var monthLabel: String = ""
  @Field var textColor: String?
  @Field var chevronColor: String?
  var onPrevious = EventDispatcher()
  var onNext = EventDispatcher()
}

// MARK: - View

public struct MonthCarouselView: ExpoSwiftUI.View {
  @ObservedObject public var props: MonthCarouselProps
  @State private var currentLabel: String = ""
  @State private var direction: Int = 1  // 1 = forward, -1 = backward
  @State private var labelID: UUID = UUID()

  public init(props: MonthCarouselProps) {
    self.props = props
    _currentLabel = State(initialValue: props.monthLabel)
  }

  private var tintColor: Color {
    if let hex = props.textColor {
      return Color(hex: hex)
    }
    return .primary
  }

  private var arrowColor: Color {
    if let hex = props.chevronColor {
      return Color(hex: hex)
    }
    return tintColor
  }

  public var body: some View {
    HStack(spacing: 4) {
      Button {
        direction = -1
        props.onPrevious()
      } label: {
        Image(systemName: "chevron.left")
          .font(.system(size: 18, weight: .semibold))
          .foregroundColor(arrowColor)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      Text(currentLabel)
        .font(.system(size: 17, weight: .semibold))
        .foregroundColor(tintColor)
        .frame(minWidth: 140)
        .multilineTextAlignment(.center)
        .id(labelID)
        .transition(.asymmetric(
          insertion: .move(edge: direction > 0 ? .trailing : .leading).combined(with: .opacity),
          removal: .move(edge: direction > 0 ? .leading : .trailing).combined(with: .opacity)
        ))

      Button {
        direction = 1
        props.onNext()
      } label: {
        Image(systemName: "chevron.right")
          .font(.system(size: 18, weight: .semibold))
          .foregroundColor(arrowColor)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
    .clipped()
    .gesture(
      DragGesture(minimumDistance: 20)
        .onEnded { value in
          if value.translation.width > 50 {
            direction = -1
            props.onPrevious()
          } else if value.translation.width < -50 {
            direction = 1
            props.onNext()
          }
        }
    )
    .onChange(of: props.monthLabel) { newLabel in
      withAnimation(.easeInOut(duration: 0.25)) {
        currentLabel = newLabel
        labelID = UUID()
      }
    }
  }
}
