/**
 * Web Content Core - Provider Config
 */

function getSecret(value: any, env: any): string | undefined {
  if (typeof value === "string") {
    // ${API_KEY} → env.API_KEY
    const match = value.match(/^\$\{([A-Z_]+)\}$/);
    if (match) return env[match[1]];
    return value;
  }
  return undefined;
}

export function getProviderConfig<T>(
  params: {
    config: any;
    kind: "search" | "fetch";
    providers: T[];
    defaultProvider?: string;
  }
): { provider: T; config: any } | null {
  const toolConfig = params.config?.tools?.web?.[params.kind];
  if (!toolConfig) return null;

  const providerId = toolConfig.provider || params.defaultProvider;
  if (!providerId) return null;

  const provider = params.providers.find(p => p.id === providerId);
  if (!provider) return null;

  // Проверяем API ключ
  const apiKey = getSecret(toolConfig.apiKey, process.env);
  if (provider.requiresCredential && !apiKey) return null;

  return { provider, config: toolConfig };
}