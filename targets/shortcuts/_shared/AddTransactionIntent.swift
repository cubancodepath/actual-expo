import AppIntents
import Foundation

@available(iOS 16.0, *)
struct AddTransactionIntent: AppIntent {
  static let title: LocalizedStringResource = "Add Transaction"
  static let description: IntentDescription = "Open Actual Budget to add a new transaction"

  static let openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    UserDefaults.standard.set("transaction/new", forKey: "pendingDeepLink")
    return .result()
  }
}
