import { FormData } from "undici";

export function isFormDataLike(value: unknown): value is FormData {
  return value instanceof FormData;
}