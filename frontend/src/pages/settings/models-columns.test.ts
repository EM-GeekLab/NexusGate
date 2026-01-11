import { describe, test, expect } from 'vitest'
import type { Model } from './models-columns'

describe('Model type', () => {
  test('creates valid chat model', () => {
    const model: Model = {
      id: 1,
      providerId: 1,
      systemName: 'gpt-4',
      remoteId: 'gpt-4-turbo',
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
  })

  test('handles null remoteId', () => {
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
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(model.remoteId).toBeNull()
    // remoteId ?? systemName pattern
    const effectiveRemoteId = model.remoteId ?? model.systemName
    expect(effectiveRemoteId).toBe('custom-model')
  })
})

describe('Model weight calculations', () => {
  test('calculates total weight', () => {
    const models: Model[] = [
      { id: 1, providerId: 1, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
      { id: 2, providerId: 2, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 2.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
      { id: 3, providerId: 3, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    ]

    const totalWeight = models.reduce((sum, m) => sum + m.weight, 0)
    expect(totalWeight).toBe(4.0)
  })

  test('normalizes weights to percentages', () => {
    const models = [
      { weight: 1.0 },
      { weight: 2.0 },
      { weight: 1.0 },
    ]

    const totalWeight = models.reduce((sum, m) => sum + m.weight, 0)
    const percentages = models.map((m) => (m.weight / totalWeight) * 100)

    expect(percentages[0]).toBe(25)
    expect(percentages[1]).toBe(50)
    expect(percentages[2]).toBe(25)
  })

  test('handles zero weight', () => {
    const model: Model = {
      id: 1,
      providerId: 1,
      systemName: 'disabled-model',
      remoteId: null,
      modelType: 'chat',
      weight: 0,
      contextLength: null,
      inputPrice: null,
      outputPrice: null,
      createdAt: '',
      updatedAt: '',
    }

    expect(model.weight).toBe(0)
    // Zero weight means model won't be selected in load balancing
  })
})

describe('Model type filtering', () => {
  test('filters chat models', () => {
    const models: Model[] = [
      { id: 1, providerId: 1, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
      { id: 2, providerId: 1, systemName: 'text-embedding-3', remoteId: null, modelType: 'embedding', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
      { id: 3, providerId: 1, systemName: 'gpt-3.5-turbo', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    ]

    const chatModels = models.filter((m) => m.modelType === 'chat')
    expect(chatModels.length).toBe(2)
  })

  test('filters embedding models', () => {
    const models: Model[] = [
      { id: 1, providerId: 1, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
      { id: 2, providerId: 1, systemName: 'text-embedding-3', remoteId: null, modelType: 'embedding', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    ]

    const embeddingModels = models.filter((m) => m.modelType === 'embedding')
    expect(embeddingModels.length).toBe(1)
    expect(embeddingModels[0].systemName).toBe('text-embedding-3')
  })
})

describe('Model display formatting', () => {
  test('formats weight with 2 decimal places', () => {
    const weight = 1.5
    const formatted = weight.toFixed(2)
    expect(formatted).toBe('1.50')
  })

  test('formats context length with locale', () => {
    const contextLength = 128000
    const formatted = contextLength.toLocaleString()
    expect(formatted).toBe('128,000')
  })

  test('displays remoteId or systemName', () => {
    const model1 = { systemName: 'gpt-4', remoteId: 'gpt-4-turbo' }
    const model2 = { systemName: 'custom-model', remoteId: null }

    expect(model1.remoteId ?? model1.systemName).toBe('gpt-4-turbo')
    expect(model2.remoteId ?? model2.systemName).toBe('custom-model')
  })
})

describe('Model by provider grouping', () => {
  test('groups models by providerId', () => {
    const models: Model[] = [
      { id: 1, providerId: 1, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
      { id: 2, providerId: 1, systemName: 'gpt-3.5', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
      { id: 3, providerId: 2, systemName: 'gpt-4', remoteId: null, modelType: 'chat', weight: 1.0, contextLength: null, inputPrice: null, outputPrice: null, createdAt: '', updatedAt: '' },
    ]

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
    expect(grouped[1].length).toBe(2)
    expect(grouped[2].length).toBe(1)
  })
})
