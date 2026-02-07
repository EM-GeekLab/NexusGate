import { treaty } from '@elysiajs/eden'
// @ts-expect-error: Type definition requires backend build. Run `bun run build` in backend first.
import type { App } from 'nexus-gate-server'

export const backendBaseURL = import.meta.env.PROD ? location.origin : import.meta.env.VITE_BASE_URL
if (!backendBaseURL) {
  throw new Error('backend domain is not defined')
}

const client = treaty<App>(backendBaseURL, {
  headers: () => {
    const adminSecret = localStorage.getItem('admin-secret')
    if (!adminSecret) return undefined
    return {
      authorization: `Bearer ${JSON.parse(adminSecret)}`,
    }
  },
})

// @ts-expect-error: Eden type inference requires backend type definition build
export const api = client.api
