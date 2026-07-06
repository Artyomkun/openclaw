// Public model-catalog facade. Keep exports here curated so callers use the
// normalized planning APIs instead of reaching into provider-index internals.
export { mergeModelCatalogRowsByAuthority } from "./authority.ts";
export { loadOpenClawProviderIndex } from "./provider-index/index.ts";
export {
  planManifestModelCatalogRows,
  planManifestModelCatalogSuppressions,
} from "./manifest-planner.ts";
export { planProviderIndexModelCatalogRows } from "./provider-index-planner.ts";
export type { ManifestModelCatalogSuppressionEntry } from "./manifest-planner.ts";
export type {
  ModelCatalog,
  ModelCatalogAlias,
  ModelCatalogCost,
  ModelCatalogDiscovery,
  ModelCatalogInput,
  ModelCatalogModel,
  ModelCatalogProvider,
  ModelCatalogSource,
  ModelCatalogStatus,
  ModelCatalogSuppression,
  ModelCatalogTieredCost,
  NormalizedModelCatalogRow,
  UnifiedModelCatalogEntry,
  UnifiedModelCatalogKind,
  UnifiedModelCatalogSource,
} from "@openclaw/model-catalog-core/model-catalog-types";
export type { OpenClawProviderIndexProvider } from "./provider-index/index.ts";
