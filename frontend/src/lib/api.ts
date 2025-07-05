import { treaty } from '@elysiajs/eden'
import type { App } from 'nexus-gate-server'

const backendBaseURL = import.meta.env.PROD ? location.origin : import.meta.env.VITE_BASE_URL
if (!backendBaseURL) {
  throw new Error('backend domain is not defined')
}

export const api = treaty<App>(backendBaseURL, {
  headers: () => {
    const adminSecret = localStorage.getItem('admin-secret')
    if (!adminSecret) return undefined
    return {
      authorization: `Bearer ${JSON.parse(adminSecret)}`,
    }
  },
}).api
