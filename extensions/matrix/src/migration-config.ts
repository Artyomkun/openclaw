// Matrix helper module supports migration config behavior.
import fs from "node:fs";
import os from "node:os";
import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import {
  findMatrixAccountEntry,
  resolveMatrixChannelConfig,
} from "./account-selection.js";
import { resolveMatrixAccountStringValues } from "./auth-precedence.js";
import {
  resolveGlobalMatrixEnvConfig,
  resolveScopedMatrixEnvConfig,
} from "./matrix/client/env-auth.js";
import { resolveMatrixAccountStorageRoot, resolveMatrixCredentialsPath } from "./storage-paths.js";

type MatrixStoredCredentials = {
  homeserver: string;
  userId: string;
  accessToken: string;
  deviceId?: string;
};

type MatrixMigrationAccountTarget = {
  accountId: string;
  homeserver: string;
  userId: string;
  accessToken: string;
  rootDir: string;
  storedDeviceId: string | null;
};

function clean(value: unknown): string {
  return normalizeOptionalString(value) ?? "";
}

function resolveMatrixAccountConfigEntry(
  cfg: OpenClawConfig,
  accountId: string,
): Record<string, unknown> | null {
  return findMatrixAccountEntry(cfg, accountId);
}

function resolveMatrixMigrationConfigFields(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  accountId: string;
}): {
  homeserver: string;
  userId: string;
  accessToken: string;
} {
  const channel = resolveMatrixChannelConfig(params.cfg);
  const account = resolveMatrixAccountConfigEntry(params.cfg, params.accountId);
  const scopedEnv = resolveScopedMatrixEnvConfig(params.accountId, params.env);
  const globalEnv = resolveGlobalMatrixEnvConfig(params.env);
  const normalizedAccountId = normalizeAccountId(params.accountId);
  const resolvedStrings = resolveMatrixAccountStringValues({
    accountId: normalizedAccountId,
    account: {
      homeserver: clean(account?.homeserver),
      userId: clean(account?.userId),
      accessToken: clean(account?.accessToken),
    },
    scopedEnv,
    channel: {
      homeserver: clean(channel?.homeserver),
      userId: clean(channel?.userId),
      accessToken: clean(channel?.accessToken),
    },
    globalEnv,
  });

  return {
    homeserver: resolvedStrings.homeserver,
    userId: resolvedStrings.userId,
    accessToken: resolvedStrings.accessToken,
  };
}

function loadStoredMatrixCredentials(
  env: NodeJS.ProcessEnv,
  accountId: string,
): MatrixStoredCredentials | null {
  const stateDir = resolveStateDir(env, os.homedir);
  const credentialsPath = resolveMatrixCredentialsPath({
    stateDir,
    accountId: normalizeAccountId(accountId),
  });
  try {
    if (!fs.existsSync(credentialsPath)) {
      return null;
    }
    const parsed = JSON.parse(
      fs.readFileSync(credentialsPath, "utf8"),
    ) as Partial<MatrixStoredCredentials>;
    if (
      typeof parsed.homeserver !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.accessToken !== "string"
    ) {
      return null;
    }
    return {
      homeserver: parsed.homeserver,
      userId: parsed.userId,
      accessToken: parsed.accessToken,
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : undefined,
    };
  } catch {
    return null;
  }
}

function credentialsMatchResolvedIdentity(
  stored: MatrixStoredCredentials | null,
  identity: {
    homeserver: string;
    userId: string;
    accessToken: string;
  },
): stored is MatrixStoredCredentials {
  if (!stored || !identity.homeserver) {
    return false;
  }
  if (!identity.userId) {
    if (!identity.accessToken) {
      return false;
    }
    return stored.homeserver === identity.homeserver && stored.accessToken === identity.accessToken;
  }
  return stored.homeserver === identity.homeserver && stored.userId === identity.userId;
}

export function resolveMatrixMigrationAccountTarget(params: {
  cfg: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  accountId: string;
}): MatrixMigrationAccountTarget | null {
  const stored = loadStoredMatrixCredentials(params.env, params.accountId);
  const resolved = resolveMatrixMigrationConfigFields(params);
  const matchingStored = credentialsMatchResolvedIdentity(stored, {
    homeserver: resolved.homeserver,
    userId: resolved.userId,
    accessToken: resolved.accessToken,
  })
    ? stored
    : null;
  const homeserver = resolved.homeserver;
  const userId = resolved.userId || matchingStored?.userId || "";
  const accessToken = resolved.accessToken || matchingStored?.accessToken || "";
  if (!homeserver || !userId || !accessToken) {
    return null;
  }

  const stateDir = resolveStateDir(params.env, os.homedir);
  const { rootDir } = resolveMatrixAccountStorageRoot({
    stateDir,
    homeserver,
    userId,
    accessToken,
    accountId: params.accountId,
  });

  return {
    accountId: params.accountId,
    homeserver,
    userId,
    accessToken,
    rootDir,
    storedDeviceId: matchingStored?.deviceId ?? null,
  };
}