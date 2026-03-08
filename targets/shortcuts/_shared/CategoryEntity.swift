import AppIntents
import Foundation

@available(iOS 16.0, *)
struct CategoryEntity: AppEntity {
    var id: String
    var name: String
    var groupId: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Category"
    static var defaultQuery = CategoryEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

@available(iOS 16.0, *)
struct CategoryEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [CategoryEntity] {
        return allCategories().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [CategoryEntity] {
        return allCategories()
    }

    private func allCategories() -> [CategoryEntity] {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
              let data = defaults.data(forKey: "categories"),
              let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }

        return json.compactMap { dict in
            guard let id = dict["id"] as? String,
                  let name = dict["name"] as? String,
                  let groupId = dict["groupId"] as? String
            else { return nil }
            return CategoryEntity(id: id, name: name, groupId: groupId)
        }
    }
}
