// Matrix plugin module implements doctor contract behavior.
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { isRecord } from "./record-shared.js";

function normalizeMatrixRoomAllowAliases(params: {
  rooms: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
}): { rooms: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const nextRooms: Record<string, unknown> = { ...params.rooms };
  for (const [roomId, roomValue] of Object.entries(params.rooms)) {
    const room = isRecord(roomValue) ? roomValue : null;
    if (!room || typeof room.allow !== "boolean") {
      continue;
    }
    const nextRoom = { ...room };
    if (typeof nextRoom.enabled !== "boolean") {
      nextRoom.enabled = room.allow;
    }
    delete nextRoom.allow;
    nextRooms[roomId] = nextRoom;
    changed = true;
    params.changes.push(
      `Moved ${params.pathPrefix}.${roomId}.allow → ${params.pathPrefix}.${roomId}.enabled (${String(nextRoom.enabled)}).`,
    );
  }
  return { rooms: nextRooms, changed };
}

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: OpenClawConfig;
}): ChannelDoctorConfigMutation {
  const channels = isRecord(cfg.channels) ? cfg.channels : null;
  const matrix = isRecord(channels?.matrix) ? channels.matrix : null;
  if (!matrix) {
    return { config: cfg, changes: [] };
  }

  const changes: string[] = [];
  let updatedMatrix: Record<string, unknown> = matrix;
  let changed = false;
  const normalizeTopLevelRoomScope = (key: "groups" | "rooms") => {
    const rooms = isRecord(updatedMatrix[key]) ? updatedMatrix[key] : null;
    if (!rooms) {
      return;
    }
    const normalized = normalizeMatrixRoomAllowAliases({
      rooms,
      pathPrefix: `channels.matrix.${key}`,
      changes,
    });
    if (normalized.changed) {
      updatedMatrix = { ...updatedMatrix, [key]: normalized.rooms };
      changed = true;
    }
  };

  normalizeTopLevelRoomScope("groups");
  normalizeTopLevelRoomScope("rooms");

  const accounts = isRecord(updatedMatrix.accounts) ? updatedMatrix.accounts : null;
  if (accounts) {
    let accountsChanged = false;
    const nextAccounts: Record<string, unknown> = { ...accounts };
    for (const [accountId, accountValue] of Object.entries(accounts)) {
      const account = isRecord(accountValue) ? accountValue : null;
      if (!account) {
        continue;
      }
      let nextAccount: Record<string, unknown> = account;
      let accountChanged = false;
      for (const key of ["groups", "rooms"] as const) {
        const rooms = isRecord(nextAccount[key]) ? nextAccount[key] : null;
        if (!rooms) {
          continue;
        }
        const normalized = normalizeMatrixRoomAllowAliases({
          rooms,
          pathPrefix: `channels.matrix.accounts.${accountId}.${key}`,
          changes,
        });
        if (normalized.changed) {
          nextAccount = { ...nextAccount, [key]: normalized.rooms };
          accountChanged = true;
        }
      }
      if (accountChanged) {
        nextAccounts[accountId] = nextAccount;
        accountsChanged = true;
      }
    }
    if (accountsChanged) {
      updatedMatrix = { ...updatedMatrix, accounts: nextAccounts };
      changed = true;
    }
  }

  if (!changed) {
    return { config: cfg, changes: [] };
  }
  return {
    config: {
      ...cfg,
      channels: {
        ...cfg.channels,
        matrix: updatedMatrix as NonNullable<OpenClawConfig["channels"]>["matrix"],
      },
    },
    changes,
  };
}
