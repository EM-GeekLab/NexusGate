/**
 * Shared constants for provider types
 * Used across provider-related components
 */

/** Available provider types */
export const PROVIDER_TYPES = [
  'openai',
  'openai-responses',
  'anthropic',
  'azure',
  'ollama',
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

/** Provider type display labels */
export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  openai: 'OpenAI Chat API',
  'openai-responses': 'OpenAI Response API',
  anthropic: 'Anthropic Claude',
  azure: 'Azure OpenAI',
  ollama: 'Ollama',
};

/** Check if a provider type requires API version field */
export function requiresApiVersion(type: ProviderType | undefined): boolean {
  return type === 'anthropic' || type === 'azure';
}

/** Get placeholder for API version based on provider type */
export function getApiVersionPlaceholder(type: ProviderType | undefined): string {
  if (type === 'anthropic') {
    return '2023-06-01';
  }
  if (type === 'azure') {
    return '2024-02-15-preview';
  }
  return '';
}
