import ExpoModulesCore
import ExpoUI

public class ActualUiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ActualUi")

    OnCreate {
      ViewModifierRegistry.register("minimumScaleFactor") { params, appContext, _ in
        return try MinimumScaleFactorModifier(from: params, appContext: appContext)
      }
    }

    OnDestroy {
      ViewModifierRegistry.unregister("minimumScaleFactor")
    }

    ExpoUIView(ScalableTextView.self)
    ExpoUIView(StripedProgressBarView.self)
    ExpoUIView(ActualNavigationStackView.self)
    View(NavTrailingView.self)
    View(NavContentView.self)
    ExpoUIView(ActualListView.self)
    ExpoUIView(ActualSectionView.self)
    View(ActualSectionHeaderView.self)
    View(ActualSectionContentView.self)
  }
}
