/** RFC 4122 v4 UUID. Uses crypto.randomUUID when available (all modern browsers on https/localhost). */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Deterministic UUID-shaped id from a string (FNV-1a based). Used for the built-in exercise
 * library so the same exercise has the same id in code, in the SQL seed and on every device.
 */
export function stableId(namespace: string, key: string): string {
  const input = `${namespace}:${key}`;
  const parts: string[] = [];
  for (let round = 0; round < 4; round++) {
    let h = 0x811c9dc5 ^ (round * 0x9e3779b1);
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    parts.push((h >>> 0).toString(16).padStart(8, "0"));
  }
  const h = parts.join("");
  // Force version 4 / variant bits so it is a valid UUID for Postgres.
  const v = "4" + h.slice(13, 16);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}-${variant}-${h.slice(20, 32)}`;
}
