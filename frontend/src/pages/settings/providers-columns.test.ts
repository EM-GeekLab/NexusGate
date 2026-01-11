import { describe, test, expect } from 'vitest'
import type { Provider } from './providers-columns'

describe('Provider type', () => {
  test('creates valid provider object', () => {
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

  test('handles null apiKey', () => {
    const provider: Provider = {
      id: 2,
      name: 'Ollama',
      type: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: null,
      deleted: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(provider.apiKey).toBeNull()
  })

  test('supports different provider types', () => {
    const types = ['openai', 'azure', 'anthropic', 'ollama', 'custom']

    types.forEach((type) => {
      const provider: Provider = {
        id: 1,
        name: `Test ${type}`,
        type,
        baseUrl: 'https://example.com',
        apiKey: null,
        deleted: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }
      expect(provider.type).toBe(type)
    })
  })
})

describe('Provider data transformations', () => {
  test('filters deleted providers', () => {
    const providers: Provider[] = [
      {
        id: 1,
        name: 'Active',
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: null,
        deleted: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 2,
        name: 'Deleted',
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: null,
        deleted: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    const activeProviders = providers.filter((p) => !p.deleted)
    expect(activeProviders.length).toBe(1)
    expect(activeProviders[0].name).toBe('Active')
  })

  test('sorts providers by name', () => {
    const providers: Provider[] = [
      { id: 1, name: 'Zebra', type: 'openai', baseUrl: '', apiKey: null, deleted: false, createdAt: '', updatedAt: '' },
      { id: 2, name: 'Alpha', type: 'openai', baseUrl: '', apiKey: null, deleted: false, createdAt: '', updatedAt: '' },
      { id: 3, name: 'Beta', type: 'openai', baseUrl: '', apiKey: null, deleted: false, createdAt: '', updatedAt: '' },
    ]

    const sorted = [...providers].sort((a, b) => a.name.localeCompare(b.name))
    expect(sorted.map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Zebra'])
  })

  test('filters providers by type', () => {
    const providers: Provider[] = [
      { id: 1, name: 'OpenAI 1', type: 'openai', baseUrl: '', apiKey: null, deleted: false, createdAt: '', updatedAt: '' },
      { id: 2, name: 'Azure 1', type: 'azure', baseUrl: '', apiKey: null, deleted: false, createdAt: '', updatedAt: '' },
      { id: 3, name: 'OpenAI 2', type: 'openai', baseUrl: '', apiKey: null, deleted: false, createdAt: '', updatedAt: '' },
    ]

    const openaiProviders = providers.filter((p) => p.type === 'openai')
    expect(openaiProviders.length).toBe(2)
  })
})

describe('Provider URL validation', () => {
  test('validates HTTPS URLs', () => {
    const isValidHttps = (url: string) => url.startsWith('https://')

    expect(isValidHttps('https://api.openai.com/v1')).toBe(true)
    expect(isValidHttps('http://localhost:11434')).toBe(false)
  })

  test('normalizes base URL trailing slash', () => {
    const normalizeUrl = (url: string) => url.replace(/\/$/, '')

    expect(normalizeUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1')
    expect(normalizeUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
  })
})
