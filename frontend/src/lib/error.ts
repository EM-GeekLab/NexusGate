import i18n from '@/i18n'

// Check if error is an authentication error (401 status)
function isAuthError(error: unknown): boolean {
  if (typeof error === 'object' && error != null && 'status' in error) {
    return (error as { status: number }).status === 401
  }
  return false
}

export function formatError(
  error: Error | string | { value: string } | { value: { message: string } } | unknown,
  fallback = i18n.t('lib.error.UnknownError'),
): Error {
  console.log(error)

  // Check for 401 auth error first
  if (isAuthError(error)) {
    return new Error(i18n.t('lib.error.AuthRequired'))
  }

  let message: string | undefined

  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else if (typeof error === 'object' && error != null && 'value' in error) {
    if (typeof error.value === 'string') {
      message = error.value
    } else if ('message' in (error.value as object)) {
      // @ts-expect-error error.value has a message property
      message = error.value.message
    }
  }

  if (message) {
    return new Error(message)
  }

  return new Error(fallback)
}

export function newApiError(
  error: { value: string } | { value: { message?: string } },
  fallback = i18n.t('lib.error.UnknownError'),
): Error {
  if (typeof error.value === 'string') return new Error(error.value)
  return new Error(error.value.message || fallback)
}
