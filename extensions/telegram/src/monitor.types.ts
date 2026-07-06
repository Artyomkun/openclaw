/**
 * Telegram - Monitor Types
 */

export type MonitorTelegramOpts = {
  token: string;
  accountId?: string;
  config?: any;
  useWebhook?: boolean;
  abortSignal?: AbortSignal;
};