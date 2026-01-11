import { vi } from 'vitest'

// Mock the api module to avoid backend URL requirement in tests
vi.mock('@/lib/api', () => ({
  api: {
    providers: {
      get: vi.fn(),
      post: vi.fn(),
      ':id': {
        patch: vi.fn(),
        delete: vi.fn(),
      },
    },
    models: {
      get: vi.fn(),
      post: vi.fn(),
      ':id': {
        patch: vi.fn(),
        delete: vi.fn(),
      },
    },
    embeddings: {
      get: vi.fn(),
    },
  },
}))
