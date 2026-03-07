import AppIntents

@available(iOS 16.0, *)
struct AddTransactionIntent: AppIntent {
  static let title: LocalizedStringResource = "Add Transaction"
  static let description: IntentDescription = "Open Actual Budget to add a new transaction"

  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    // openAppWhenRun = true opens the app and runs perform() in the app process.
    // Write the desired route to UserDefaults so the React Native layer can navigate.
    UserDefaults.standard.set("/(auth)/transaction/new", forKey: "shortcutAction")
    UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "shortcutActionTimestamp")
    UserDefaults.standard.synchronize()
    return .result()
  }
}
