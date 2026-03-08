import AppIntents
import Foundation

@available(iOS 16.0, *)
struct AccountEntity: AppEntity {
    var id: String
    var name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Account"
    static var defaultQuery = AccountEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

@available(iOS 16.0, *)
struct AccountEntityQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [AccountEntity] {
        return allAccounts().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [AccountEntity] {
        let query = string.lowercased()
        return allAccounts().filter { $0.name.lowercased().contains(query) }
    }

    func suggestedEntities() async throws -> [AccountEntity] {
        return allAccounts()
    }

    private func allAccounts() -> [AccountEntity] {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
              let data = defaults.data(forKey: "accounts"),
              let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }

        return json.compactMap { dict in
            guard let id = dict["id"] as? String,
                  let name = dict["name"] as? String
            else { return nil }
            return AccountEntity(id: id, name: name)
        }
    }
}
