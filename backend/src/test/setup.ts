import { vi } from 'vitest'

// Mock @/db module
vi.mock('@/db', () => ({
  getModelsWithProviderBySystemName: vi.fn(),
  findApiKey: vi.fn(),
  insertEmbedding: vi.fn(),
  insertLog: vi.fn(),
}))

// Mock @/db/schema module
vi.mock('@/db/schema', () => ({}))
