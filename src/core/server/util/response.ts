export function dataOrSelf(json: unknown): unknown {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data?: unknown }).data ?? json;
  }

  return json;
}
