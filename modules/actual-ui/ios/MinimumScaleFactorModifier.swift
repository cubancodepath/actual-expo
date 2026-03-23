import SwiftUI
import ExpoModulesCore
import ExpoUI

struct MinimumScaleFactorModifier: ViewModifier, Record {
  @Field var factor: CGFloat = 1.0

  func body(content: Content) -> some View {
    content
      .minimumScaleFactor(factor)
  }
}

// Also register as a built-in style modifier that can be applied to Text
extension Text {
  func applyMinimumScaleFactor(_ factor: CGFloat) -> some View {
    self.minimumScaleFactor(factor)
  }
}
