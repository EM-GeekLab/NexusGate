/**
 * Proxy-aware fetch utility
 * Uses Bun's native proxy support in fetch()
 */

import type { ProviderConfig } from "@/adapters/types";

/**
 * Get the effective proxy URL for a provider, or undefined if proxy is not active.
 */
export function getProviderProxy(
  provider: Pick<ProviderConfig, "proxyUrl" | "proxyEnabled">,
): string | undefined {
  if (provider.proxyEnabled && provider.proxyUrl) {
    return provider.proxyUrl;
  }
  return undefined;
}

/**
 * Fetch with optional proxy support.
 * Uses Bun's native `proxy` option on BunFetchRequestInit.
 */
export async function proxyFetch(
  url: string | URL | Request,
  init: RequestInit,
  proxy?: string,
): Promise<Response> {
  if (proxy) {
    const options: RequestInit & { proxy: string } = { ...init, proxy };
    return fetch(url, options);
  }
  return fetch(url, init);
}
