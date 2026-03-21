import ExpoModulesCore
import ExpoUI

public class ActualUiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ActualUi")

    ExpoUIView(StripedProgressBarView.self)
  }
}
