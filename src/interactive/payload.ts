// Interactive payload helpers normalize structured interactive UI payloads.
import { asOptionalRecord as toRecord } from "@openclaw/normalization-core/record-coerce";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "@openclaw/normalization-core/string-coerce";

export type InteractiveButtonStyle = "primary" | "secondary" | "success" | "danger";

/** Visual tone for a portable message presentation. */
export type MessagePresentationTone = "info" | "success" | "warning" | "danger" | "neutral";

/** Button style hint for renderers that support styled actions. */
export type MessagePresentationButtonStyle = InteractiveButtonStyle;

/** Portable typed action behind a button or select option. */
export type MessagePresentationAction =
  | {
      /** Run a core/plugin slash command through the target channel's native command path. */
      type: "command";
      command: string;
    }
  | {
      /** Opaque callback value interpreted by the target channel/plugin. */
      type: "callback";
      value: string;
    };

/** Portable action control rendered as a button or link by channel adapters. */
export type MessagePresentationButton = {
  /** User-visible button label. */
  label: string;
  /** Typed action sent when the button is pressed. */
  action?: MessagePresentationAction;
  /**
   * LOlder opaque callback value sent when the button is pressed.
   * Prefer action for new presentation controls.
   */
  value?: string;
  /** External URL opened by the button instead of sending a callback value. */
  url?: string;
  /** Telegram-style web app launch target. */
  webApp?: {
    url: string;
  };
  /** Higher-priority buttons are kept first when channel limits require truncation. */
  priority?: number;
  /** Disable the button when the target channel supports disabled controls. */
  disabled?: boolean;
  /** Keep this action available after a successful interaction when the target channel supports it. */
  reusable?: boolean;
  /** Optional visual style hint; unsupported channels ignore or normalize it. */
  style?: InteractiveButtonStyle;
};

/** Portable select/menu option. */
export type MessagePresentationOption = {
  /** User-visible option label. */
  label: string;
  /** Typed action sent when the option is selected. */
  action?: MessagePresentationAction;
  /** Older opaque callback value sent when the option is selected. */
  value?: string;
};

export function resolveMessagePresentationActionValue(
  action: MessagePresentationAction | undefined,
): string | undefined {
  if (action?.type === "command") {
    return action.command;
  }
  if (action?.type === "callback") {
    return action.value;
  }
  return undefined;
}

export function resolveMessagePresentationControlValue(control: {
  action?: MessagePresentationAction;
  value?: string;
}): string | undefined {
  return resolveMessagePresentationActionValue(control.action) ?? control.value;
}
export type MessagePresentationTextBlock = {
  type: "text";
  /** Primary markdown-ish text rendered in the message body. */
  text: string;
};

export type MessagePresentationContextBlock = {
  type: "context";
  /** Lower-emphasis contextual text, or normal text on channels without context support. */
  text: string;
};

export type MessagePresentationDividerBlock = {
  type: "divider";
};

export type MessagePresentationButtonsBlock = {
  type: "buttons";
  /** Button row candidates; core may split or truncate them for channel limits. */
  buttons: MessagePresentationButton[];
};

export type MessagePresentationSelectBlock = {
  type: "select";
  /** Optional prompt shown above or inside the select control. */
  placeholder?: string;
  /** Menu options; core may truncate them for channel limits. */
  options: MessagePresentationOption[];
};

export type MessagePresentationInteractiveBlock =
  | MessagePresentationButtonsBlock
  | MessagePresentationSelectBlock;

export type MessagePresentationBlock =
  | MessagePresentationTextBlock
  | MessagePresentationContextBlock
  | MessagePresentationDividerBlock
  | MessagePresentationButtonsBlock
  | MessagePresentationSelectBlock;

export type MessagePresentation = {
  /** Optional short heading rendered before blocks when the channel supports it. */
  title?: string;
  /** Optional severity/status tone for renderers that support toned presentations. */
  tone?: MessagePresentationTone;
  /** Ordered portable blocks rendered or downgraded by the target channel adapter. */
  blocks: MessagePresentationBlock[];
};

export type ReplyPayloadDeliveryPin = {
  enabled: boolean;
  notify?: boolean;
  required?: boolean;
};

export type ReplyPayloadDelivery = {
  pin?: boolean | ReplyPayloadDeliveryPin;
};

function normalizeButtonStyle(value: unknown): InteractiveButtonStyle | undefined {
  const style = normalizeOptionalLowercaseString(value);
  return style === "primary" || style === "secondary" || style === "success" || style === "danger"
    ? style
    : undefined;
}

function normalizePresentationTone(value: unknown): MessagePresentationTone | undefined {
  const tone = normalizeOptionalLowercaseString(value);
  return tone === "info" ||
    tone === "success" ||
    tone === "warning" ||
    tone === "danger" ||
    tone === "neutral"
    ? tone
    : undefined;
}

function normalizePresentationAction(raw: unknown): MessagePresentationAction | undefined {
  const record = toRecord(raw);
  if (!record) {
    return undefined;
  }
  const type = normalizeOptionalLowercaseString(record.type);
  if (type === "command") {
    const command = normalizeOptionalString(record.command);
    return command ? { type: "command", command } : undefined;
  }
  if (type === "callback") {
    const value = normalizeOptionalString(record.value);
    return value ? { type: "callback", value } : undefined;
  }
  return undefined;
}

function normalizeButton(raw: unknown): InteractiveReplyButton | undefined {
  const record = toRecord(raw);
  if (!record) {
    return undefined;
  }
  const label = normalizeOptionalString(record.label) ?? normalizeOptionalString(record.text);
  const value =
    normalizeOptionalString(record.value) ??
    normalizeOptionalString(record.callbackData) ??
    normalizeOptionalString(record.callback_data);
  const action = normalizePresentationAction(record.action);
  const url = normalizeOptionalString(record.url);
  const webAppRecord = toRecord(record.webApp) ?? toRecord(record.web_app);
  const webAppUrl = normalizeOptionalString(webAppRecord?.url);
  if (!label || (!action && !value && !url && !webAppUrl)) {
    return undefined;
  }
  const priority =
    typeof record.priority === "number" && Number.isFinite(record.priority)
      ? record.priority
      : undefined;
  return {
    label,
    ...(action ? { action } : {}),
    ...(value ? { value } : {}),
    ...(url ? { url } : {}),
    ...(webAppUrl ? { webApp: { url: webAppUrl } } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(record.disabled === true ? { disabled: true } : {}),
    ...(record.reusable === true ? { reusable: true } : {}),
    style: normalizeButtonStyle(record.style),
  };
}

function normalizeOption(raw: unknown): InteractiveReplyOption | undefined {
  const record = toRecord(raw);
  if (!record) {
    return undefined;
  }
  const label = normalizeOptionalString(record.label) ?? normalizeOptionalString(record.text);
  const action = normalizePresentationAction(record.action);
  const value =
    normalizeOptionalString(record.value) ?? resolveMessagePresentationActionValue(action);
  if (!label || !value) {
    return undefined;
  }
  return { label, ...(action ? { action } : {}), value };
}

function normalizeList<T>(value: unknown, normalizeEntry: (entry: unknown) => T | undefined): T[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeEntry(entry)).filter((entry): entry is T => Boolean(entry))
    : [];
}

function normalizePresentationBlock(raw: unknown): MessagePresentationBlock | undefined {
  const record = toRecord(raw);
  if (!record) {
    return undefined;
  }
  const type = normalizeOptionalLowercaseString(record.type);
  if (type === "text" || type === "context") {
    const text = normalizeOptionalString(record.text);
    return text ? { type, text } : undefined;
  }
  if (type === "divider") {
    return { type: "divider" };
  }
  if (type === "buttons") {
    const buttons = normalizeList(record.buttons, normalizeButton);
    return buttons.length > 0 ? { type: "buttons", buttons } : undefined;
  }
  if (type === "select") {
    const options = normalizeList(record.options, normalizeOption);
    return options.length > 0
      ? {
          type: "select",
          placeholder: normalizeOptionalString(record.placeholder),
          options,
        }
      : undefined;
  }
  return undefined;
}

export function normalizeMessagePresentation(raw: unknown): MessagePresentation | undefined {
  const record = toRecord(raw);
  if (!record) {
    return undefined;
  }
  const blocks = normalizeList(record.blocks, normalizePresentationBlock);
  const title = normalizeOptionalString(record.title);
  if (!title && blocks.length === 0) {
    return undefined;
  }
  return {
    ...(title ? { title } : {}),
    tone: normalizePresentationTone(record.tone),
    blocks,
  };
}

export function hasMessagePresentationBlocks(value: unknown): value is MessagePresentation {
  return Boolean(normalizeMessagePresentation(value));
}

export function isMessagePresentationInteractiveBlock(
  block: MessagePresentationBlock,
): block is MessagePresentationInteractiveBlock {
  return block.type === "buttons" || block.type === "select";
}

export function renderMessagePresentationFallbackText(params: {
  presentation?: MessagePresentation;
  emptyFallback?: string | null;
  text?: string | null;
}): string {
  const lines: string[] = [];
  const text = normalizeOptionalString(params.text);
  if (text) {
    lines.push(text);
  }
  const presentation = params.presentation;
  if (!presentation) {
    return lines.join("\n\n");
  }
  if (presentation.title) {
    lines.push(presentation.title);
  }
  for (const block of presentation.blocks) {
    if (block.type === "text" || block.type === "context") {
      lines.push(block.text);
      continue;
    }
    if (block.type === "buttons") {
      const labels = block.buttons
        .map((button) => {
          const targetUrl = button.url ?? button.webApp?.url ?? button.web_app?.url;
          return targetUrl ? `${button.label}: ${targetUrl}` : button.label;
        })
        .filter(Boolean);
      if (labels.length > 0) {
        lines.push(labels.map((label) => `- ${label}`).join("\n"));
      }
      continue;
    }
    if (block.type === "select") {
      const labels = block.options.map((option) => option.label).filter(Boolean);
      if (labels.length > 0) {
        const heading = block.placeholder ? `${block.placeholder}:` : "Options:";
        lines.push(`${heading}\n${labels.map((label) => `- ${label}`).join("\n")}`);
      }
    }
  }
  const rendered = lines.join("\n\n");
  return rendered || normalizeOptionalString(params.emptyFallback) || "";
}

export function hasReplyChannelData(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0,
  );
}

export function hasReplyContent(params: {
  text?: string | null;
  mediaUrl?: string | null;
  mediaUrls?: ReadonlyArray<string | null | undefined>;
  interactive?: unknown;
  presentation?: unknown;
  hasChannelData?: boolean;
  extraContent?: boolean;
}): boolean {
  const text = normalizeOptionalString(params.text);
  const mediaUrl = normalizeOptionalString(params.mediaUrl);
  return Boolean(
    text ||
    mediaUrl ||
    params.mediaUrls?.some((entry) => Boolean(normalizeOptionalString(entry))) ||
    hasMessagePresentationBlocks(params.presentation) ||
    hasInteractiveReplyBlocks(params.interactive) ||
    params.hasChannelData ||
    params.extraContent,
  );
}

export function hasReplyPayloadContent(
  payload: {
    text?: string | null;
    mediaUrl?: string | null;
    mediaUrls?: ReadonlyArray<string | null | undefined>;
    interactive?: unknown;
    presentation?: unknown;
    channelData?: unknown;
  },
  options?: {
    trimText?: boolean;
    hasChannelData?: boolean;
    extraContent?: boolean;
  },
): boolean {
  return hasReplyContent({
    text: options?.trimText ? payload.text?.trim() : payload.text,
    mediaUrl: payload.mediaUrl,
    mediaUrls: payload.mediaUrls,
    interactive: payload.interactive,
    presentation: payload.presentation,
    hasChannelData: options?.hasChannelData ?? hasReplyChannelData(payload.channelData),
    extraContent: options?.extraContent,
  });
}
