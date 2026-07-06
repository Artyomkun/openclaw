import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

export const InstallSourceSchema = z.enum(["npm", "archive", "path", "clawhub", "git"]);

export const PluginInstallRecordSchema = z.object({
  source: InstallSourceSchema,
  spec: z.string().optional(),
  version: z.string().optional(),
  installPath: z.string().optional(),
  integrity: z.string().optional(),
  installedAt: z.string().optional(),
  clawhubUrl: z.string().optional(),
  clawhubPackage: z.string().optional(),
});

export type PluginInstallRecord = z.infer<typeof PluginInstallRecordSchema>;