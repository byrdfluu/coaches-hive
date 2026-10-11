export class PublicError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export async function readJSONBody<T>(request: Request, maxBytes: number): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PublicError("request_too_large", "Request is too large.", 413);
  }
  if (!request.body) throw new PublicError("invalid_request", "Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PublicError("request_too_large", "Request is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new PublicError("invalid_json", "Request body must be valid JSON.");
  }
}

export function publicErrorResponse(error: unknown, headers: HeadersInit = {}) {
  const known = error instanceof PublicError;
  if (!known) console.error(error);
  return Response.json({
    error: known ? error.message : "The request could not be completed.",
    code: known ? error.code : "internal_error",
  }, { status: known ? error.status : 500, headers });
}

export function requireUUID(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new PublicError("invalid_request", `${field} must be a valid identifier.`);
  }
  return value;
}

export function requireDate(value: unknown, field: string): Date {
  if (typeof value !== "string") throw new PublicError("invalid_request", `${field} is required.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new PublicError("invalid_request", `${field} must be a valid date.`);
  return date;
}
