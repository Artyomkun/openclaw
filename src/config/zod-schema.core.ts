import { z } from "zod";

// ============================================
// CONFIG SCHEMAS
// ============================================

export const SecretInputSchema = z.union([
  z.string(),
  z.object({
    source: z.enum(["env", "file", "exec"]),
    provider: z.string(),
    id: z.string(),
  }),
]);

export const ModelCompatSchema = z.object({
  supportsStore: z.boolean().optional(),
  supportsPromptCacheKey: z.boolean().optional(),
  supportsDeveloperRole: z.boolean().optional(),
  supportsReasoningEffort: z.boolean().optional(),
  supportsUsageInStreaming: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  supportsStrictMode: z.boolean().optional(),
  requiresStringContent: z.boolean().optional(),
  strictMessageKeys: z.boolean().optional(),
  thinkingFormat: z.enum(["gemini", "deepseek", "qwen", "together", "openrouter", "zai"]).optional(),
  toolSchemaProfile: z.string().optional(),
  unsupportedToolSchemaKeywords: z.array(z.string()).optional(),
}).optional();

export const ModelDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  api: z.enum(["openai-completions", "openai-responses", "azure-openai-responses", "anthropic-messages", "google-generative-ai"]).optional(),
  baseUrl: z.string().optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.enum(["text", "image", "video", "audio"])).optional(),
  contextWindow: z.number().positive().optional(),
  maxTokens: z.number().positive().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  compat: ModelCompatSchema,
});

export const ModelProviderSchema = z.object({
  baseUrl: z.string().optional(),
  api: z.string().optional(),
  apiKey: SecretInputSchema.optional(),
  contextWindow: z.number().positive().optional(),
  maxTokens: z.number().positive().optional(),
  timeoutSeconds: z.number().int().positive().optional(),
  headers: z.record(z.string(), SecretInputSchema).optional(),
  models: z.array(ModelDefinitionSchema).optional(),
});

export const ModelsConfigSchema = z.object({
  providers: z.record(z.string(), ModelProviderSchema).optional(),
});

export const GroupPolicySchema = z.enum(["open", "disabled", "allowlist"]);
export const DmPolicySchema = z.enum(["pairing", "allowlist", "open", "disabled"]);
export const ContextVisibilityModeSchema = z.enum(["all", "allowlist", "allowlist_quote"]);

export const GroupChatSchema = z.object({
  mentionPatterns: z.array(z.string()).optional(),
  historyLimit: z.number().int().positive().optional(),
  visibleReplies: z.union([z.boolean(), z.enum(["automatic", "message_tool"])]).optional(),
}).optional();

export const IdentitySchema = z.object({
  name: z.string().optional(),
  theme: z.string().optional(),
  emoji: z.string().optional(),
}).optional();

export const TtsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().optional(),
  auto: z.enum(["off", "always", "inbound", "tagged"]).optional(),
  mode: z.enum(["final", "all"]).optional(),
}).optional();

export const HumanDelaySchema = z.object({
  mode: z.enum(["off", "natural", "custom"]).optional(),
  minMs: z.number().int().nonnegative().optional(),
  maxMs: z.number().int().nonnegative().optional(),
}).optional();

// ============================================
// EXPORTS
// ============================================

export const CoreSchemas = {
  SecretInput: SecretInputSchema,
  ModelCompat: ModelCompatSchema,
  ModelDefinition: ModelDefinitionSchema,
  ModelProvider: ModelProviderSchema,
  ModelsConfig: ModelsConfigSchema,
  GroupPolicy: GroupPolicySchema,
  DmPolicy: DmPolicySchema,
  ContextVisibility: ContextVisibilityModeSchema,
  GroupChat: GroupChatSchema,
  Identity: IdentitySchema,
  TtsConfig: TtsConfigSchema,
  HumanDelay: HumanDelaySchema,
};