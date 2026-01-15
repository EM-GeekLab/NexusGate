import * as crypto from "node:crypto";
import { updateApiKey, type ApiKey } from "@/db";

/**
 * Validate and get API key record
 * @param key the key to check
 * @returns API key record if valid, null otherwise
 */
export async function validateApiKey(key: string): Promise<ApiKey | null> {
  const r = await updateApiKey({
    key,
    lastSeen: new Date(),
  });

  if (
    r !== null &&
    !r.revoked &&
    (r.expiresAt === null || r.expiresAt > new Date())
  ) {
    return r;
  }

  return null;
}

/**
 * check if an API key is valid
 * @param key the key to check
 * @returns true if the key is valid
 * @deprecated Use validateApiKey instead for access to full record
 */
export async function checkApiKey(key: string): Promise<boolean> {
  const r = await validateApiKey(key);
  return r !== null;
}

/**
 * generate a random API key
 * @returns a new API key
 */
export function generateApiKey() {
  const buf = crypto.randomBytes(16);

  return `sk-${Array.from(buf, (v) => v.toString(16).padStart(2, "0")).join("")}`;
}
