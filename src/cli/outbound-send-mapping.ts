// Maps CLI send dependency sources into outbound send dependencies with aliases.
import {
  type OutboundSendDeps,
} from "../infra/outbound/send-deps.ts";

/**
 * CLI-internal send function sources, keyed by channel ID.
 * Each value is a lazily-loaded send function for that channel.
 */
export const CLI_OUTBOUND_SEND_FACTORY: unique symbol = Symbol.for(
  "openclaw.cliOutboundSendFactory",
) as never;

type CliOutboundSendFactory = (channelId: string) => unknown;
export type CliOutboundSendSource = {
  [channelId: string]: unknown;
  [CLI_OUTBOUND_SEND_FACTORY]?: CliOutboundSendFactory;
};

/**
 * Pass CLI send sources through as-is — both CliOutboundSendSource and
 * OutboundSendDeps are now channel-ID-keyed records.
 */
export function createOutboundSendDepsFromCliSource(deps: CliOutboundSendSource): OutboundSendDeps {
  const outbound: OutboundSendDeps = { ...deps };
  const sendFactory = deps[CLI_OUTBOUND_SEND_FACTORY];

  for (const channelId of Object.keys(outbound)) {
    const sourceValue = outbound[channelId];
    if (sourceValue === undefined) {
      continue;
    }
  }

  if (!sendFactory) {
    return outbound;
  }

  return new Proxy(outbound, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }
      const existing = Reflect.get(target, property, receiver);
      if (existing !== undefined) {
        return existing;
      }
    },
  });
}
