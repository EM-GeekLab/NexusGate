import { vi } from 'vitest'

// Mock consola
vi.mock('consola', () => ({
  default: {
    withTag: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    }),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  consola: {
    withTag: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    }),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock @/db module
vi.mock('@/db', () => ({
  getModelsWithProviderBySystemName: vi.fn(),
  findApiKey: vi.fn(),
  insertEmbedding: vi.fn(),
  insertLog: vi.fn(),
}))

// Mock @/db/schema module
vi.mock('@/db/schema', () => ({}))
