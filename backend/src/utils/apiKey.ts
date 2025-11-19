import * as crypto from "node:crypto";
import { updateApiKey } from "@/db";

/**
 * check if an API key is valid
 * @param key the key to check
 * @returns true if the key is valid
 */
export async function checkApiKey(key: string): Promise<boolean> {
  const r = await updateApiKey({
    key,
    lastSeen: new Date(),
  });
  return (
    r !== null &&
    !r.revoked &&
    (r.expiresAt === null || r.expiresAt > new Date())
  );
}

/**
 * generate a random API key
 * @returns a new API key
 */
export function generateApiKey() {
  const buf = crypto.randomBytes(16);

  return `sk-${Array.from(buf, (v) => v.toString(16).padStart(2, "0")).join("")}`;
}
