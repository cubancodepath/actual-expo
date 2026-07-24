/**
 * Global function registry. Both the built-in plugins and Actual's
 * CustomFunctionsPlugin register through the same path, so argument coercion and
 * metadata handling are uniform.
 *
 * Registration resolves the translated (enUS) name → plugin class + method +
 * metadata. Actual's translations are identity maps, so translated === canonical.
 */

import {
  EngineInterpreter,
  FunctionMetadata,
  FunctionPlugin,
  FunctionTranslationsPackage,
  ImplementedFunctions,
} from "./plugin";

export type PluginClass = {
  new (interpreter: EngineInterpreter): FunctionPlugin;
  implementedFunctions: ImplementedFunctions;
  aliases?: Record<string, string>;
};

type RegistryEntry = {
  pluginClass: PluginClass;
  metadata: FunctionMetadata;
};

const registry = new Map<string, RegistryEntry>();

/** Register a plugin's functions under their enUS-translated names. */
export function registerFunctionPlugin(
  pluginClass: PluginClass,
  translations?: FunctionTranslationsPackage,
): void {
  const implemented = pluginClass.implementedFunctions;
  const enUS = translations?.enUS;

  for (const canonicalName of Object.keys(implemented)) {
    const translated = enUS?.[canonicalName] ?? canonicalName;
    registry.set(translated.toUpperCase(), {
      pluginClass,
      metadata: implemented[canonicalName],
    });
  }

  if (pluginClass.aliases) {
    for (const [alias, target] of Object.entries(pluginClass.aliases)) {
      const entry = implemented[target];
      if (entry) {
        registry.set(alias.toUpperCase(), { pluginClass, metadata: entry });
      }
    }
  }
}

export function getFunctionEntry(name: string): RegistryEntry | undefined {
  return registry.get(name.toUpperCase());
}

export function hasFunction(name: string): boolean {
  return registry.has(name.toUpperCase());
}

/** Per-interpreter cache of plugin instances (one per plugin class). */
export class PluginInstanceCache {
  private instances = new Map<PluginClass, FunctionPlugin>();

  constructor(private readonly interpreter: EngineInterpreter) {}

  get(pluginClass: PluginClass): FunctionPlugin {
    let instance = this.instances.get(pluginClass);
    if (!instance) {
      instance = new pluginClass(this.interpreter);
      this.instances.set(pluginClass, instance);
    }
    return instance;
  }
}
