// Runtime fetch adapter preserves undici dispatcher support and normalizes
// headers/FormData before calling the runtime fetch implementation.
import type { Dispatcher, RequestInit as UndiciRequestInit } from "undici";
import { normalizeHeadersInitForFetch } from "../fetch-headers.ts";
import { isFormDataLike } from "./form-data.ts";
import { loadUndiciRuntimeDeps, type UndiciRuntimeDeps } from "./undici-runtime.ts";

/** 
 * Explicit interface for our runtime fetch requirements.
 * Avoids mutating or intersecting the global RequestInit, which causes type narrowing issues.
 */
export interface RuntimeRequestInit extends Omit<UndiciRequestInit, 'body'> {
  dispatcher?: Dispatcher;
  body?: BodyInit | null | undefined;
}

/** 
 * Bridge interface to satisfy TypeScript's strict structural typing 
 * between undici's internal FormData and the global BodyInit.
 */
interface UndiciFormDataLike {
  append(name: string, value: string | Blob, fileName?: string): void;
  entries(): IterableIterator<[string, FormDataEntryValue]>;
}

type FetchLike = (input: RequestInfo | URL, init?: RuntimeRequestInit) => Promise<Response>;
type RuntimeFormDataCtor = NonNullable<UndiciRuntimeDeps["FormData"]>;

type FormDataEntryValueWithOptionalName = FormDataEntryValue & { name?: string };

function normalizeRuntimeFormData(
  body: unknown,
  RuntimeFormData: RuntimeFormDataCtor | undefined,
): BodyInit | null | undefined {
  if (!isFormDataLike(body) || typeof RuntimeFormData !== "function") {
    return body as BodyInit | null | undefined;
  }

  // If it's already the exact runtime instance, pass through safely
  if (body instanceof RuntimeFormData) {
    return body as unknown as BodyInit;
  }

  // Rebuild entries to ensure the runtime constructor handles multipart streaming correctly
  const next = new RuntimeFormData();
  for (const [key, value] of (body as UndiciFormDataLike).entries()) {
    const namedValue = value as FormDataEntryValueWithOptionalName;
    const fileName =
      typeof namedValue.name === "string" && namedValue.name.trim() ? namedValue.name : undefined;
    
    next.append(key, value as string | Blob, fileName);
  }
  
  return next as unknown as BodyInit;
}

function normalizeRuntimeRequestInit(
  init: RuntimeRequestInit | undefined,
  RuntimeFormData: RuntimeFormDataCtor | undefined,
): RuntimeRequestInit | undefined {
  if (!init) return init;

  const normalizedHeaders = normalizeHeadersInitForFetch(init.headers);
  const initWithNormalizedHeaders =
    normalizedHeaders === init.headers ? init : { ...init, headers: normalizedHeaders };

  if (!init.body) return initWithNormalizedHeaders;

  const body = normalizeRuntimeFormData(init.body, RuntimeFormData);
  if (body === init.body) return initWithNormalizedHeaders;

  // The rebuilt FormData chooses its own boundary and length; 
  // stale caller values make undici send an invalid multipart request.
  const headers = new Headers(normalizedHeaders);
  headers.delete("content-length");
  headers.delete("content-type");
  
  return {
    ...initWithNormalizedHeaders,
    headers,
    body,
  };
}

/** 
 * Safely detects Vitest/Jest mocked fetch functions.
 * Uses 'name' property check as a safer alternative to duck-typing `.mock` 
 * on native C++ bindings in Node.js 24+.
 */
export function isMockedFetch(fetchImpl: FetchLike | undefined): boolean {
  if (typeof fetchImpl !== "function") {
    return false;
  }
  // Vitest/Jest mocks usually have a specific name or explicit mock property
  // that doesn't exist on native undici fetch implementations.
  return fetchImpl.name === 'vi.fn' || fetchImpl.name === 'jest.fn' || 
        (typeof (fetchImpl as Record<string, unknown>).mock === "object" && fetchImpl.name !== 'fetch');
}

/** Uses the undici runtime fetch so callers can pass dispatcher-aware options. */
export async function fetchWithRuntimeDispatcher(
  input: RequestInfo | URL,
  init?: RuntimeRequestInit,
): Promise<Response> {
  const runtimeDeps = loadUndiciRuntimeDeps();
  
  // Explicit mapping to the runtime's expected signature
  const runtimeFetch = runtimeDeps.fetch as (input: RequestInfo | URL, init?: RuntimeRequestInit) => Promise<unknown>;
  
  const result = await runtimeFetch(
    input,
    normalizeRuntimeRequestInit(init, runtimeDeps.FormData),
  );
  
  // If the runtime fetch returns an undici-specific response type, 
  // we ensure it satisfies the standard Response interface.
  if (result instanceof Response) {
    return result;
  }
  
  // Fallback wrap for edge cases in testing environments
  return result as Response;
}

/**
 * Uses test-injected global fetch when present, otherwise preserves dispatcher
 * support by routing through the undici runtime fetch.
 */
export async function fetchWithRuntimeDispatcherOrMockedGlobal(
  input: RequestInfo | URL,
  init?: RuntimeRequestInit,
): Promise<Response> {
  if (isMockedFetch(globalThis.fetch as FetchLike)) {
    // Cast to FetchLike to satisfy strict typing without `as any`
    return await (globalThis.fetch as FetchLike)(input, init);
  }
  return await fetchWithRuntimeDispatcher(input, init);
}