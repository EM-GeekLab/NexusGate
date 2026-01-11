import { describe, test, expect } from 'vitest'
import { columns, type Model } from './models-columns'

// ============================================
// Tests for Model type
// ============================================
describe('Model type', () => {
  test('creates valid chat model', () => {
    const model: Model = {
      id: 1,
      providerId: 1,
      systemName: 'gpt-4',
      remoteId: 'gpt-4-turbo-preview',
      modelType: 'chat',
      weight: 1.0,
      contextLength: 128000,
      inputPrice: '10.00',
      outputPrice: '30.00',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(model.id).toBe(1)
    expect(model.systemName).toBe('gpt-4')
    expect(model.modelType).toBe('chat')
    expect(model.weight).toBe(1.0)
    expect(model.contextLength).toBe(128000)
  })

  test('creates valid embedding model', () => {
    const model: Model = {
      id: 2,
      providerId: 1,
      systemName: 'text-embedding-3-large',
      remoteId: null,
      modelType: 'embedding',
      weight: 1.0,
      contextLength: 8191,
      inputPrice: '0.13',
      outputPrice: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(model.modelType).toBe('embedding')
    expect(model.outputPrice).toBeNull()
    expect(model.remoteId).toBeNull()
  })

  test('handles null remoteId - uses systemName as fallback', () => {
    const model: Model = {
      id: 1,
      providerId: 1,
      systemName: 'custom-model',
      remoteId: null,
      modelType: 'chat',
      weight: 1.0,
      contextLength: null,
      inputPrice: null,
      outputPrice: null,
      createdAt: '',
      updatedAt: '',
    }

    // This is the logic used in getRemoteModelId
    const effectiveRemoteId = model.remoteId ?? model.systemName
    expect(effectiveRemoteId).toBe('custom-model')
  })
})

// ============================================
// Tests for columns definition
// ============================================
describe('columns definition', () => {
  test('columns array is defined and has correct length', () => {
    expect(columns).toBeDefined()
    expect(Array.isArray(columns)).toBe(true)
    expect(columns.length).toBe(6) // systemName, remoteId, modelType, weight, contextLength, actions
  })

  test('systemName column has correct accessor', () => {
    const col = columns.find((c) => 'accessorKey' in c && c.accessorKey === 'systemName')
    expect(col).toBeDefined()
    expect(col?.cell).toBeDefined()
  })

  test('remoteId column has correct accessor', () => {
    const col = columns.find((c) => 'accessorKey' in c && c.accessorKey === 'remoteId')
    expect(col).toBeDefined()
    expect(col?.cell).toBeDefined()
  })

  test('modelType column has correct accessor', () => {
    const col = columns.find((c) => 'accessorKey' in c && c.accessorKey === 'modelType')
    expect(col).toBeDefined()
    expect(col?.cell).toBeDefined()
  })

  test('weight column has correct accessor', () => {
    const col = columns.find((c) => 'accessorKey' in c && c.accessorKey === 'weight')
    expect(col).toBeDefined()
    expect(col?.cell).toBeDefined()
  })

  test('contextLength column has correct accessor', () => {
    const col = columns.find((c) => 'accessorKey' in c && c.accessorKey === 'contextLength')
    expect(col).toBeDefined()
    expect(col?.cell).toBeDefined()
  })

  test('actions column is defined', () => {
    const col = columns.find((c) => c.id === 'actions')
    expect(col).toBeDefined()
    expect(col?.cell).toBeDefined()
  })
})

// ============================================
// Tests for Model weight calculations
// ============================================
describe('Model weight calculations', () => {
  const testModels: Model[] = [
    { id: 1, providerId: 1, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    { id: 2, providerId: 2, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 2.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    { id: 3, providerId: 3, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
  ]

  test('calculates total weight', () => {
    const totalWeight = testModels.reduce((sum, m) => sum + m.weight, 0)
    expect(totalWeight).toBe(4.0)
  })

  test('calculates weight percentages', () => {
    const totalWeight = testModels.reduce((sum, m) => sum + m.weight, 0)
    const percentages = testModels.map((m) => (m.weight / totalWeight) * 100)
    expect(percentages[0]).toBe(25)
    expect(percentages[1]).toBe(50)
    expect(percentages[2]).toBe(25)
  })

  test('filters out zero-weight models for selection', () => {
    const modelsWithZero: Model[] = [
      ...testModels,
      { id: 4, providerId: 4, systemName: 'disabled', remoteId: null, modelType: 'chat', weight: 0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    ]
    const activeModels = modelsWithZero.filter((m) => m.weight > 0)
    expect(activeModels.length).toBe(3)
  })
})

// ============================================
// Tests for Model type filtering
// ============================================
describe('Model type filtering', () => {
  const mixedModels: Model[] = [
    { id: 1, providerId: 1, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    { id: 2, providerId: 1, systemName: 'text-embedding-3', remoteId: null, modelType: 'embedding', weight: 1, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    { id: 3, providerId: 1, systemName: 'gpt-3.5-turbo', remoteId: null, modelType: 'chat', weight: 1, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    { id: 4, providerId: 2, systemName: 'text-embedding-ada', remoteId: null, modelType: 'embedding', weight: 1, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
  ]

  test('filters chat models', () => {
    const chatModels = mixedModels.filter((m) => m.modelType === 'chat')
    expect(chatModels.length).toBe(2)
    expect(chatModels.every((m) => m.modelType === 'chat')).toBe(true)
  })

  test('filters embedding models', () => {
    const embeddingModels = mixedModels.filter((m) => m.modelType === 'embedding')
    expect(embeddingModels.length).toBe(2)
    expect(embeddingModels.every((m) => m.modelType === 'embedding')).toBe(true)
  })

  test('counts models by type', () => {
    const counts = mixedModels.reduce(
      (acc, m) => {
        acc[m.modelType] = (acc[m.modelType] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    expect(counts.chat).toBe(2)
    expect(counts.embedding).toBe(2)
  })
})

// ============================================
// Tests for Model grouping by provider
// ============================================
describe('Model grouping', () => {
  const models: Model[] = [
    { id: 1, providerId: 1, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    { id: 2, providerId: 1, systemName: 'gpt-3.5', remoteId: null, modelType: 'chat', weight: 1, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    { id: 3, providerId: 2, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    { id: 4, providerId: 1, systemName: 'embedding', remoteId: null, modelType: 'embedding', weight: 1, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
  ]

  test('groups models by providerId', () => {
    const grouped = models.reduce(
      (acc, model) => {
        const key = model.providerId
        if (!acc[key]) acc[key] = []
        acc[key].push(model)
        return acc
      },
      {} as Record<number, Model[]>
    )

    expect(Object.keys(grouped).length).toBe(2)
    expect(grouped[1].length).toBe(3)
    expect(grouped[2].length).toBe(1)
  })

  test('groups models by systemName for load balancing', () => {
    const grouped = models.reduce(
      (acc, model) => {
        const key = model.systemName
        if (!acc[key]) acc[key] = []
        acc[key].push(model)
        return acc
      },
      {} as Record<string, Model[]>
    )

    expect(grouped['gpt-4'].length).toBe(2) // Available from 2 providers
    expect(grouped['gpt-3.5'].length).toBe(1)
  })
})

// ============================================
// Tests for display formatting
// ============================================
describe('Display formatting', () => {
  test('formats weight with 2 decimal places', () => {
    const weights = [1, 1.5, 2.333, 0.1]
    const formatted = weights.map((w) => w.toFixed(2))
    expect(formatted).toEqual(['1.00', '1.50', '2.33', '0.10'])
  })

  test('formats context length with locale separators', () => {
    const contextLengths = [128000, 8191, 32768]
    const formatted = contextLengths.map((c) => c.toLocaleString('en-US'))
    expect(formatted).toEqual(['128,000', '8,191', '32,768'])
  })

  test('displays effective model ID (remoteId or systemName)', () => {
    const model1 = { systemName: 'gpt-4', remoteId: 'gpt-4-turbo' }
    const model2 = { systemName: 'custom-model', remoteId: null }

    expect(model1.remoteId ?? model1.systemName).toBe('gpt-4-turbo')
    expect(model2.remoteId ?? model2.systemName).toBe('custom-model')
  })
})
