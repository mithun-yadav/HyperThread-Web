export const PRIVATE_RESPONSE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
} as const;

export function privateJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) {
    headers.set(name, value);
  }
  return Response.json(body, { ...init, headers });
}
