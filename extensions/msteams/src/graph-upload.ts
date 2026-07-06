/**
 * Microsoft Graph API Integration — Native TypeScript
 * Полная интеграция с Microsoft Graph API для работы с OneDrive/SharePoint
 * Всё через TypeScript, но с использованием Oracle через oracledb
 */

import oracledb from "oracledb";

// ========================================================================
// ТИПЫ
// ========================================================================

interface UploadResult {
  itemId: string;
  webUrl: string;
  name: string;
}

interface SharingLinkResult {
  webUrl: string;
}

interface DriveItemProperties {
  eTag: string;
  webDavUrl: string;
  name: string;
}

interface ChatMember {
  aadObjectId: string;
  displayName?: string;
}

// ========================================================================
// УТИЛИТЫ
// ========================================================================

class GraphApiClient {
  private pool: oracledb.Pool;
  private graphRoot = "https://graph.microsoft.com/v1.0";
  private graphBeta = "https://graph.microsoft.com/beta";

  constructor(pool: oracledb.Pool) {
    this.pool = pool;
  }

  // Получение токена через Oracle
  private async getAccessToken(): Promise<string> {
    const conn = await this.pool.getConnection();
    try {
      const result = await conn.execute(
        `SELECT access_token FROM ms_graph_tokens 
        WHERE token_type = 'default' AND expires_at > SYSTIMESTAMP`
      );
      if (!result.rows?.length) {
        await this.refreshToken(conn);
        const refreshed = await conn.execute(
          `SELECT access_token FROM ms_graph_tokens WHERE token_type = 'default'`
        );
        return refreshed.rows?.[0]?.[0] as string;
      }
      return result.rows[0][0] as string;
    } finally {
      await conn.close();
    }
  }

  private async refreshToken(conn: oracledb.Connection): Promise<void> {
    const config = {
      clientId: process.env.MS_GRAPH_CLIENT_ID || "",
      clientSecret: process.env.MS_GRAPH_CLIENT_SECRET || "",
      tenantId: process.env.MS_GRAPH_TENANT_ID || "",
    };

    const response = await fetch(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );

    const data = (await response.json()) as { access_token: string; expires_in: number };
    
    await conn.execute(
        `MERGE INTO ms_graph_tokens t
        USING (SELECT 'default' AS token_type FROM DUAL) s
        ON (t.token_type = s.token_type)
        WHEN MATCHED THEN
          UPDATE SET access_token = :token, expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:expires, 'SECOND')
        WHEN NOT MATCHED THEN
          INSERT (token_type, access_token, expires_at)
          VALUES ('default', :token, SYSTIMESTAMP + NUMTODSINTERVAL(:expires, 'SECOND'))`,
      { token: data.access_token, expires: data.expires_in }
    );
    await conn.commit();
  }

  async uploadToOneDrive(params: {
    buffer: Buffer;
    filename: string;
    contentType?: string;
  }): Promise<UploadResult> {
    const token = await this.getAccessToken();
    const url = `${this.graphRoot}/me/drive/root:/OpenClawShared/${encodeURIComponent(params.filename)}:/content`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": params.contentType ?? "application/octet-stream",
        "User-Agent": "OpenClaw-Oracle/1.0",
      },
      body: params.buffer,
    });

    if (!response.ok) {
      throw new Error(`OneDrive upload failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { id: string; webUrl: string; name: string };
    return { itemId: data.id, webUrl: data.webUrl, name: data.name };
  }

  async createSharingLink(params: {
    itemId: string;
    scope?: "organization" | "anonymous";
  }): Promise<SharingLinkResult> {
    const token = await this.getAccessToken();
    const url = `${this.graphRoot}/me/drive/items/${params.itemId}/createLink`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "OpenClaw-Oracle/1.0",
      },
      body: JSON.stringify({ type: "view", scope: params.scope ?? "organization" }),
    });

    if (!response.ok) {
      throw new Error(`Create sharing link failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { link: { webUrl: string } };
    return { webUrl: data.link.webUrl };
  }

  async uploadAndShareOneDrive(params: {
    buffer: Buffer;
    filename: string;
    contentType?: string;
    scope?: "organization" | "anonymous";
  }): Promise<UploadResult> {
    const uploaded = await this.uploadToOneDrive(params);
    const shareLink = await this.createSharingLink({ itemId: uploaded.itemId, scope: params.scope });
    return { ...uploaded, webUrl: shareLink.webUrl };
  }

  async uploadToSharePoint(params: {
    buffer: Buffer;
    filename: string;
    siteId: string;
    contentType?: string;
  }): Promise<UploadResult> {
    const token = await this.getAccessToken();
    const url = `${this.graphRoot}/sites/${params.siteId}/drive/root:/OpenClawShared/${encodeURIComponent(params.filename)}:/content`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": params.contentType ?? "application/octet-stream",
        "User-Agent": "OpenClaw-Oracle/1.0",
      },
      body: params.buffer,
    });

    if (!response.ok) {
      throw new Error(`SharePoint upload failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { id: string; webUrl: string; name: string };
    return { itemId: data.id, webUrl: data.webUrl, name: data.name };
  }

  async createSharePointSharingLink(params: {
    siteId: string;
    itemId: string;
    scope?: "organization" | "users";
    recipientObjectIds?: string[];
  }): Promise<SharingLinkResult> {
    const token = await this.getAccessToken();
    const apiRoot = params.scope === "users" ? this.graphBeta : this.graphRoot;
    const url = `${apiRoot}/sites/${params.siteId}/drive/items/${params.itemId}/createLink`;

    const body: Record<string, unknown> = {
      type: "view",
      scope: params.scope === "users" ? "users" : "organization",
    };

    if (params.scope === "users" && params.recipientObjectIds?.length) {
      body.recipients = params.recipientObjectIds.map((id) => ({ objectId: id }));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "OpenClaw-Oracle/1.0",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Create SharePoint sharing link failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { link: { webUrl: string } };
    return { webUrl: data.link.webUrl };
  }

  async getChatMembers(params: {
    chatId: string;
  }): Promise<ChatMember[]> {
    const token = await this.getAccessToken();
    const url = `${this.graphRoot}/chats/${params.chatId}/members`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "OpenClaw-Oracle/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Get chat members failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { value: Array<{ userId: string; displayName?: string }> };
    return data.value.map((m) => ({
      aadObjectId: m.userId,
      displayName: m.displayName,
    }));
  }

  async uploadAndShareSharePoint(params: {
    buffer: Buffer;
    filename: string;
    siteId: string;
    chatId?: string;
    contentType?: string;
    usePerUserSharing?: boolean;
  }): Promise<UploadResult> {
    const uploaded = await this.uploadToSharePoint({
      buffer: params.buffer,
      filename: params.filename,
      siteId: params.siteId,
      contentType: params.contentType,
    });

    let scope: "organization" | "users" = "organization";
    let recipientObjectIds: string[] | undefined;

    if (params.usePerUserSharing && params.chatId) {
      try {
        const members = await this.getChatMembers({ chatId: params.chatId });
        if (members.length > 0) {
          scope = "users";
          recipientObjectIds = members.map((m) => m.aadObjectId);
        }
      } catch (error) {
        console.warn('Failed to get chat members, falling back to organization scope:', 
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    const shareLink = await this.createSharePointSharingLink({
      siteId: params.siteId,
      itemId: uploaded.itemId,
      scope,
      recipientObjectIds,
    });

    return { ...uploaded, webUrl: shareLink.webUrl };
  }

  async getDriveItemProperties(params: {
    siteId: string;
    itemId: string;
  }): Promise<DriveItemProperties> {
    const token = await this.getAccessToken();
    const url = `${this.graphRoot}/sites/${params.siteId}/drive/items/${params.itemId}?$select=eTag,webDavUrl,name`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "OpenClaw-Oracle/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Get driveItem properties failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { eTag: string; webDavUrl: string; name: string };
    return { eTag: data.eTag, webDavUrl: data.webDavUrl, name: data.name };
  }
}

let client: GraphApiClient;

export function getGraphApiClient(pool: oracledb.Pool): GraphApiClient {
  if (!client) {
    client = new GraphApiClient(pool);
  }
  return client;
}

export async function initGraphTables(pool: oracledb.Pool): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      BEGIN
        EXECUTE IMMEDIATE '
          CREATE TABLE ms_graph_tokens (
            token_type VARCHAR2(50) PRIMARY KEY,
            access_token CLOB NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP
          )
        ';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export { GraphApiClient };