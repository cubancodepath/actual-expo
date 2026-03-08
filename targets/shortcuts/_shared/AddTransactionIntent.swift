import AppIntents

@available(iOS 16.0, *)
struct AddTransactionIntent: AppIntent {
  static let title: LocalizedStringResource = "Add Transaction"
  static let description: IntentDescription = "Open Actual Budget to add a new transaction"

  static let openAppWhenRun: Bool = true

  static var parameterSummary: some ParameterSummary {
    Summary("Add \(\.$amount) at \(\.$payeeName) for \(\.$category) in \(\.$account)")
  }

  @Parameter(title: "Account")
  var account: AccountEntity

  @Parameter(title: "Category")
  var category: CategoryEntity?

  @Parameter(title: "Amount")
  var amount: Double?

  @Parameter(title: "Payee")
  var payeeName: String?

  @MainActor
  func perform() async throws -> some IntentResult {
    UserDefaults.standard.set("/(auth)/transaction/new", forKey: "shortcutAction")
    UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "shortcutActionTimestamp")

    // Account (required)
    UserDefaults.standard.set(account.id, forKey: "shortcutAccountId")
    UserDefaults.standard.set(account.name, forKey: "shortcutAccountName")

    // Category (optional)
    if let cat = category {
      UserDefaults.standard.set(cat.id, forKey: "shortcutCategoryId")
      UserDefaults.standard.set(cat.name, forKey: "shortcutCategoryName")
    } else {
      UserDefaults.standard.removeObject(forKey: "shortcutCategoryId")
      UserDefaults.standard.removeObject(forKey: "shortcutCategoryName")
    }

    // Amount (optional, user enters decimal e.g. 12.50 → stored as cents 1250)
    if let amt = amount {
      UserDefaults.standard.set(Int(round(amt * 100)), forKey: "shortcutAmount")
    } else {
      UserDefaults.standard.removeObject(forKey: "shortcutAmount")
    }

    // Payee (optional, free text — created on save if new)
    if let payee = payeeName, !payee.isEmpty {
      UserDefaults.standard.set(payee, forKey: "shortcutPayeeName")
    } else {
      UserDefaults.standard.removeObject(forKey: "shortcutPayeeName")
    }

    UserDefaults.standard.synchronize()
    return .result()
  }
}
