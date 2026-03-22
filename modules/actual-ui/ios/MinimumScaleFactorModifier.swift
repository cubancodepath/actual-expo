import SwiftUI
import ExpoModulesCore
import ExpoUI

struct MinimumScaleFactorModifier: ViewModifier, Record {
  @Field var factor: CGFloat = 1.0

  func body(content: Content) -> some View {
    content.minimumScaleFactor(factor)
  }
}
