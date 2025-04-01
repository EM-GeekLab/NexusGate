import i18n from '@/i18n'

export function formatError(
  error: Error | string | { value: string } | { value: { message: string } } | unknown,
  fallback = i18n.t('Unknown error'),
): Error {
  console.log(error)
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  if (typeof error === 'object' && error != null && 'value' in error) {
    if (typeof error.value === 'string') return new Error(error.value)
    // @ts-expect-error error.value has a message property
    if ('message' in error.value) return new Error(error.value.message)
  }
  return new Error(fallback)
}

export function newApiError(
  error: { value: string } | { value: { message?: string } },
  fallback = i18n.t('Unknown error'),
): Error {
  if (typeof error.value === 'string') return new Error(error.value)
  return new Error(error.value.message || fallback)
}
