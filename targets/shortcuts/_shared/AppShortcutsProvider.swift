import AppIntents

@available(iOS 16.0, *)
struct ActualBudgetShortcutsProvider: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddTransactionIntent(),
      phrases: [
        "Add transaction in \(.applicationName)",
        "New transaction in \(.applicationName)",
        "Add a transaction with \(.applicationName)",
        "Nueva transaccion en \(.applicationName)",
        "Agregar transaccion en \(.applicationName)"
      ],
      shortTitle: "Add Transaction",
      systemImageName: "plus.circle"
    )
  }
}
