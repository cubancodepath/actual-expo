/** Register features and their minimum required server versions here. */
const FEATURE_REQUIREMENTS: Record<string, string> = {
  // "payeeLocations": "26.4.0",  // uncomment when server ships with the migration
};

export type ServerFeatures = Record<string, boolean>;

/** Compare two semver strings. Returns -1, 0, or 1. */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/** Resolve which features are supported for a given server version. */
export function resolveFeatures(serverVersion: string): ServerFeatures {
  const features: ServerFeatures = {};
  for (const [feature, minVersion] of Object.entries(FEATURE_REQUIREMENTS)) {
    features[feature] = compareSemver(serverVersion, minVersion) >= 0;
  }
  return features;
}

/** Check if a specific feature is supported. Returns false for unknown features. */
export function isFeatureSupported(features: ServerFeatures, feature: string): boolean {
  return features[feature] ?? false;
}
