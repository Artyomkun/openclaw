/**
 * Memory Host - POST JSON
 */

export async function postJson<T>(params: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  errorPrefix: string;
}): Promise<T> {
  const res = await fetch(params.url, {
    method: "POST",
    headers: params.headers,
    body: JSON.stringify(params.body),
  });

  if (!res.ok) {
    throw new Error(`${params.errorPrefix}: ${res.status} ${res.statusText}`);
  }

  return await res.json();
}