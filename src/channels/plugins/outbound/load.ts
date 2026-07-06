/**
 * Lazy channel outbound adapter loader.
 *
 * Loads only outbound send primitives from the channel registry for cheap delivery paths.
 */
import type { ChannelId } from "../channel-id.types.ts";
import type { ChannelOutboundAdapter } from "../outbound.types.ts";
import { createChannelRegistryLoader } from "../registry-loader.ts";
import type { LoadChannelOutboundAdapter } from "./load.types.ts";

const loadOutboundAdapterFromRegistry = createChannelRegistryLoader<ChannelOutboundAdapter>(
  (entry) => entry.plugin.outbound,
);

export async function loadChannelOutboundAdapter(
  id: ChannelId,
): Promise<ChannelOutboundAdapter | undefined> {
  return loadOutboundAdapterFromRegistry(id);
}

export type { LoadChannelOutboundAdapter };
