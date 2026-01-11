import { describe, test, expect } from 'vitest'

// Define the EmbeddingRequest type for tests
interface EmbeddingRequest {
  id: number
  model: string
  modelId: number | null
  input: string | string[]
  inputTokens: number
  embedding: number[][]
  dimensions: number
  status: 'pending' | 'completed' | 'failed'
  duration: number
  createdAt: string
  updatedAt: string
}

describe('EmbeddingRequest type', () => {
  test('creates valid completed embedding request', () => {
    const request: EmbeddingRequest = {
      id: 1,
      model: 'text-embedding-3-large',
      modelId: 1,
      input: 'Hello, world!',
      inputTokens: 4,
      embedding: [[0.1, 0.2, 0.3, 0.4, 0.5]],
      dimensions: 5,
      status: 'completed',
      duration: 150,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(request.status).toBe('completed')
    expect(request.inputTokens).toBe(4)
    expect(request.dimensions).toBe(5)
    expect(request.duration).toBe(150)
  })

  test('handles pending status', () => {
    const request: EmbeddingRequest = {
      id: 2,
      model: 'text-embedding-3-large',
      modelId: 1,
      input: 'test',
      inputTokens: -1,
      embedding: [],
      dimensions: 0,
      status: 'pending',
      duration: -1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(request.status).toBe('pending')
    expect(request.inputTokens).toBe(-1)
  })

  test('handles failed status', () => {
    const request: EmbeddingRequest = {
      id: 3,
      model: 'text-embedding-3-large',
      modelId: 1,
      input: 'test',
      inputTokens: -1,
      embedding: [],
      dimensions: 0,
      status: 'failed',
      duration: 50,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(request.status).toBe('failed')
    expect(request.embedding.length).toBe(0)
  })
})

describe('Input display', () => {
  test('truncates long string input', () => {
    const input = 'This is a very long text that should be truncated for display purposes in the table'
    const maxLength = 50
    const truncated = input.length > maxLength ? input.substring(0, maxLength) + '...' : input
    expect(truncated.length).toBeLessThanOrEqual(maxLength + 3)
    expect(truncated.endsWith('...')).toBe(true)
  })

  test('handles array input display', () => {
    const input = ['Hello', 'World', 'Test']
    const displayText = `[${input.length} items]`
    expect(displayText).toBe('[3 items]')
  })

  test('displays single item array as text', () => {
    const input = ['Hello, world!']
    const displayText = input.length === 1 ? input[0] : `[${input.length} items]`
    expect(displayText).toBe('Hello, world!')
  })
})

describe('Duration formatting', () => {
  test('formats duration in seconds', () => {
    const durationMs = 1500
    const formatted = (durationMs / 1000).toFixed(2) + 's'
    expect(formatted).toBe('1.50s')
  })

  test('formats short duration', () => {
    const durationMs = 50
    const formatted = (durationMs / 1000).toFixed(2) + 's'
    expect(formatted).toBe('0.05s')
  })

  test('handles zero duration', () => {
    const durationMs = 0
    const formatted = (durationMs / 1000).toFixed(2) + 's'
    expect(formatted).toBe('0.00s')
  })
})

describe('Embedding vector display', () => {
  test('shows first N values with ellipsis', () => {
    const vector = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2]
    const showCount = 10
    const display = vector.slice(0, showCount).map((v) => v.toFixed(6))
    const hasMore = vector.length > showCount

    expect(display.length).toBe(10)
    expect(hasMore).toBe(true)
  })

  test('formats vector values to 6 decimal places', () => {
    const value = 0.123456789
    const formatted = value.toFixed(6)
    expect(formatted).toBe('0.123457') // Rounded
  })

  test('handles negative values', () => {
    const vector = [-0.5, 0.5, -0.3, 0.3]
    const formatted = vector.map((v) => v.toFixed(6))
    expect(formatted[0]).toBe('-0.500000')
    expect(formatted[1]).toBe('0.500000')
  })
})

describe('Status filtering', () => {
  test('filters completed requests', () => {
    const requests: EmbeddingRequest[] = [
      { id: 1, model: 'm', modelId: 1, input: '', inputTokens: 0, embedding: [], dimensions: 0, status: 'completed', duration: 0, createdAt: '', updatedAt: '' },
      { id: 2, model: 'm', modelId: 1, input: '', inputTokens: 0, embedding: [], dimensions: 0, status: 'pending', duration: 0, createdAt: '', updatedAt: '' },
      { id: 3, model: 'm', modelId: 1, input: '', inputTokens: 0, embedding: [], dimensions: 0, status: 'failed', duration: 0, createdAt: '', updatedAt: '' },
    ]

    const completed = requests.filter((r) => r.status === 'completed')
    expect(completed.length).toBe(1)
  })

  test('counts requests by status', () => {
    const requests: EmbeddingRequest[] = [
      { id: 1, model: 'm', modelId: 1, input: '', inputTokens: 0, embedding: [], dimensions: 0, status: 'completed', duration: 0, createdAt: '', updatedAt: '' },
      { id: 2, model: 'm', modelId: 1, input: '', inputTokens: 0, embedding: [], dimensions: 0, status: 'completed', duration: 0, createdAt: '', updatedAt: '' },
      { id: 3, model: 'm', modelId: 1, input: '', inputTokens: 0, embedding: [], dimensions: 0, status: 'failed', duration: 0, createdAt: '', updatedAt: '' },
    ]

    const statusCounts = requests.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    expect(statusCounts.completed).toBe(2)
    expect(statusCounts.failed).toBe(1)
    expect(statusCounts.pending).toBeUndefined()
  })
})

describe('Token usage', () => {
  test('sums total tokens', () => {
    const requests = [{ inputTokens: 10 }, { inputTokens: 20 }, { inputTokens: 30 }]
    const totalTokens = requests.reduce((sum, r) => sum + r.inputTokens, 0)
    expect(totalTokens).toBe(60)
  })

  test('excludes pending requests from token count', () => {
    const requests: EmbeddingRequest[] = [
      { id: 1, model: 'm', modelId: 1, input: '', inputTokens: 10, embedding: [], dimensions: 0, status: 'completed', duration: 0, createdAt: '', updatedAt: '' },
      { id: 2, model: 'm', modelId: 1, input: '', inputTokens: -1, embedding: [], dimensions: 0, status: 'pending', duration: 0, createdAt: '', updatedAt: '' },
    ]

    const validRequests = requests.filter((r) => r.inputTokens >= 0)
    const totalTokens = validRequests.reduce((sum, r) => sum + r.inputTokens, 0)
    expect(totalTokens).toBe(10)
  })
})

describe('Date formatting', () => {
  test('parses ISO date string', () => {
    const dateStr = '2024-01-15T14:30:00Z'
    const date = new Date(dateStr)
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(0) // January
    expect(date.getDate()).toBe(15)
  })

  test('handles timezone correctly', () => {
    const dateStr = '2024-01-15T14:30:00Z'
    const date = new Date(dateStr)
    expect(date.toISOString()).toBe('2024-01-15T14:30:00.000Z')
  })
})

describe('Batch embeddings', () => {
  test('counts embeddings in batch', () => {
    const embedding = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
      [0.7, 0.8, 0.9],
    ]
    expect(embedding.length).toBe(3)
  })

  test('all embeddings have same dimensions', () => {
    const embedding = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]
    const dimensions = embedding.map((e) => e.length)
    const allSame = dimensions.every((d) => d === dimensions[0])
    expect(allSame).toBe(true)
  })
})
