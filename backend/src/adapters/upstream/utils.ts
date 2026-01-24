/**
 * Shared utility functions for upstream adapters
 */

import type { ImageContentBlock, InternalContentBlock } from "../types";

/**
 * Convert image source to URL format (data URL for base64, direct URL for url type)
 */
export function convertImageToUrl(block: ImageContentBlock): string {
  if (block.source.type === "url") {
    return block.source.url;
  }
  // Convert base64 to data URL
  if (block.source.type === "base64") {
    return `data:${block.source.mediaType || "image/jpeg"};base64,${block.source.data}`;
  }
  return "";
}

/**
 * Check if content blocks contain any images
 */
export function hasImages(content: InternalContentBlock[]): boolean {
  return content.some((b) => b.type === "image");
}
