import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const ChannelMetaSchema = z.object({
  id: z.string(),
  label: z.string(),
  detailLabel: z.string().optional(),
  systemImage: z.string().optional(),
  docsPath: z.string().optional(),
  blurb: z.string().optional(),
});

const ChannelCatalogEntrySchema = z.object({
  id: z.string(),
  pluginId: z.string().optional(),
  meta: ChannelMetaSchema,
  install: z.object({
    npmSpec: z.string().optional(),
    clawhubSpec: z.string().optional(),
    localPath: z.string().optional(),
  }),
});

type ChannelCatalogEntry = z.infer<typeof ChannelCatalogEntrySchema>;

// ============================================
// CATALOG
// ============================================

const catalog = new Map<string, ChannelCatalogEntry>();

export function registerChannel(entry: ChannelCatalogEntry): void {
  const parsed = ChannelCatalogEntrySchema.parse(entry);
  catalog.set(parsed.id, parsed);
}

export function getChannel(id: string): ChannelCatalogEntry | undefined {
  return catalog.get(id);
}

export function listChannels(): ChannelCatalogEntry[] {
  return Array.from(catalog.values());
}

export function buildUiCatalog(): {
  entries: { id: string; label: string; detailLabel: string }[];
  order: string[];
} {
  const entries = listChannels().map((entry) => ({
    id: entry.id,
    label: entry.meta.label,
    detailLabel: entry.meta.detailLabel || entry.meta.label,
  }));

  return {
    entries,
    order: entries.map((e) => e.id),
  };
}