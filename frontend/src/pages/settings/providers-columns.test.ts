import { describe, test, expect } from 'vitest'
import { columns, type Provider } from './providers-columns'

// ============================================
// Tests for Provider type
// ============================================
describe('Provider type', () => {
  test('creates valid provider object with all fields', () => {
    const provider: Provider = {
      id: 1,
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-key',
      deleted: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(provider.id).toBe(1)
    expect(provider.name).toBe('OpenAI')
    expect(provider.type).toBe('openai')
    expect(provider.baseUrl).toBe('https://api.openai.com/v1')
    expect(provider.apiKey).toBe('sk-test-key')
    expect(provider.deleted).toBe(false)
  })

  test('handles null apiKey for providers without authentication', () => {
    const provider: Provider = {
      id: 2,
      name: 'Ollama Local',
      type: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: null,
      deleted: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(provider.apiKey).toBeNull()
    expect(provider.type).toBe('ollama')
  })
})

// ============================================
// Tests for columns definition
// ============================================
describe('columns definition', () => {
  test('columns array is defined and has correct length', () => {
    expect(columns).toBeDefined()
    expect(Array.isArray(columns)).toBe(true)
    expect(columns.length).toBe(6) // expand, name, type, baseUrl, apiKey, actions
  })

  test('expand column is defined with correct id', () => {
    const expandColumn = columns.find((col) => col.id === 'expand')
    expect(expandColumn).toBeDefined()
    expect(expandColumn?.id).toBe('expand')
  })

  test('name column has correct accessor', () => {
    const nameColumn = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'name')
    expect(nameColumn).toBeDefined()
    expect(nameColumn?.header).toBeDefined()
  })

  test('type column has correct accessor', () => {
    const typeColumn = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'type')
    expect(typeColumn).toBeDefined()
    expect(typeColumn?.cell).toBeDefined() // Has custom cell renderer
  })

  test('baseUrl column has correct accessor', () => {
    const baseUrlColumn = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'baseUrl')
    expect(baseUrlColumn).toBeDefined()
    expect(baseUrlColumn?.cell).toBeDefined() // Has custom cell renderer
  })

  test('apiKey column has correct accessor', () => {
    const apiKeyColumn = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'apiKey')
    expect(apiKeyColumn).toBeDefined()
    expect(apiKeyColumn?.cell).toBeDefined() // Has custom cell renderer
  })

  test('actions column is defined', () => {
    const actionsColumn = columns.find((col) => col.id === 'actions')
    expect(actionsColumn).toBeDefined()
    expect(actionsColumn?.cell).toBeDefined()
  })
})

// ============================================
// Tests for Provider data transformations
// ============================================
describe('Provider data transformations', () => {
  const testProviders: Provider[] = [
    { id: 1, name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'key1', deleted: false, createdAt: '', updatedAt: '' },
    { id: 2, name: 'Azure', type: 'azure', baseUrl: 'https://azure.openai.com', apiKey: 'key2', deleted: false, createdAt: '', updatedAt: '' },
    { id: 3, name: 'Deleted Provider', type: 'openai', baseUrl: '', apiKey: null, deleted: true, createdAt: '', updatedAt: '' },
    { id: 4, name: 'Ollama', type: 'ollama', baseUrl: 'http://localhost:11434', apiKey: null, deleted: false, createdAt: '', updatedAt: '' },
  ]

  test('filters active providers', () => {
    const activeProviders = testProviders.filter((p) => !p.deleted)
    expect(activeProviders.length).toBe(3)
    expect(activeProviders.every((p) => !p.deleted)).toBe(true)
  })

  test('filters providers by type', () => {
    const openaiProviders = testProviders.filter((p) => p.type === 'openai')
    expect(openaiProviders.length).toBe(2)
  })

  test('finds provider by id', () => {
    const provider = testProviders.find((p) => p.id === 2)
    expect(provider).toBeDefined()
    expect(provider?.name).toBe('Azure')
  })

  test('finds provider by name case-insensitive', () => {
    const searchName = 'openai'
    const provider = testProviders.find((p) => p.name.toLowerCase() === searchName.toLowerCase())
    expect(provider).toBeDefined()
    expect(provider?.id).toBe(1)
  })

  test('sorts providers by name', () => {
    const sorted = [...testProviders].sort((a, b) => a.name.localeCompare(b.name))
    expect(sorted[0].name).toBe('Azure')
    expect(sorted[sorted.length - 1].name).toBe('OpenAI')
  })

  test('counts providers with apiKey', () => {
    const withApiKey = testProviders.filter((p) => p.apiKey !== null)
    expect(withApiKey.length).toBe(2)
  })
})

// ============================================
// Tests for URL validation helpers
// ============================================
describe('URL handling', () => {
  test('normalizes trailing slash', () => {
    const normalize = (url: string) => url.replace(/\/$/, '')
    expect(normalize('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1')
    expect(normalize('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
  })

  test('identifies HTTPS URLs', () => {
    const isHttps = (url: string) => url.startsWith('https://')
    expect(isHttps('https://api.openai.com/v1')).toBe(true)
    expect(isHttps('http://localhost:11434')).toBe(false)
  })

  test('extracts domain from URL', () => {
    const getDomain = (url: string) => {
      try {
        return new URL(url).hostname
      } catch {
        return null
      }
    }
    expect(getDomain('https://api.openai.com/v1')).toBe('api.openai.com')
    expect(getDomain('http://localhost:11434')).toBe('localhost')
  })
})
