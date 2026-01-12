import { describe, test, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { columns } from './columns'

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    initReactI18next: { type: '3rdParty', init: () => {} },
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

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
  duration: number | null
  createdAt: string
  updatedAt: string
}

// Helper to create mock row
const createMockRow = (request: EmbeddingRequest) => ({
  original: request,
})

// ============================================
// Tests for columns definition
// ============================================
describe('columns definition', () => {
  test('columns array is defined and has correct length', () => {
    expect(columns).toBeDefined()
    expect(Array.isArray(columns)).toBe(true)
    expect(columns.length).toBe(6) // createdAt, model, input, inputTokens, dimensions, duration
  })

  test('createdAt column has correct accessor', () => {
    const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'createdAt')
    expect(column).toBeDefined()
    expect(column?.header).toBeDefined()
  })

  test('model column has correct accessor', () => {
    const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'model')
    expect(column).toBeDefined()
    expect(column?.cell).toBeDefined()
  })

  test('input column has correct accessor', () => {
    const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'input')
    expect(column).toBeDefined()
    expect(column?.cell).toBeDefined()
  })

  test('inputTokens column has correct accessor', () => {
    const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'inputTokens')
    expect(column).toBeDefined()
    expect(column?.cell).toBeDefined()
  })

  test('dimensions column has correct accessor', () => {
    const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'dimensions')
    expect(column).toBeDefined()
    expect(column?.cell).toBeDefined()
  })

  test('duration column has correct accessor', () => {
    const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'duration')
    expect(column).toBeDefined()
    expect(column?.cell).toBeDefined()
  })
})

// ============================================
// Tests for cell renderers
// ============================================
describe('Cell renderers', () => {
  const baseRequest: EmbeddingRequest = {
    id: 1,
    model: 'text-embedding-3-large',
    modelId: 1,
    input: 'Hello, world!',
    inputTokens: 4,
    embedding: [[0.1, 0.2, 0.3]],
    dimensions: 3,
    status: 'completed',
    duration: 150,
    createdAt: '2024-01-15T14:30:00Z',
    updatedAt: '2024-01-15T14:30:00Z',
  }

  describe('createdAt column', () => {
    test('renders completed status indicator with green background', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'createdAt')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = { ...baseRequest, status: 'completed' }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        // Check for the green indicator class (bg-green-500)
        expect(container.innerHTML).toContain('bg-green-500')
      }
    })

    test('renders pending status indicator with neutral background', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'createdAt')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = { ...baseRequest, status: 'pending' }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        // Check for the neutral indicator class (bg-neutral-500)
        expect(container.innerHTML).toContain('bg-neutral-500')
      }
    })

    test('renders failed status indicator with destructive background', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'createdAt')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = { ...baseRequest, status: 'failed' }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        // Check for the destructive indicator class (bg-destructive)
        expect(container.innerHTML).toContain('bg-destructive')
      }
    })

    test('renders formatted date', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'createdAt')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const mockRow = createMockRow(baseRequest)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        // Should contain formatted date (MM-dd HH:mm:ss format)
        expect(container.textContent).toMatch(/\d{2}-\d{2}/)
      }
    })
  })

  describe('model column', () => {
    test('renders model name in badge', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'model')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const mockRow = createMockRow(baseRequest)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toContain('text-embedding-3-large')
      }
    })
  })

  describe('input column', () => {
    test('renders string input', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'input')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const mockRow = createMockRow(baseRequest)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toContain('Hello, world!')
      }
    })

    test('renders array input', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'input')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = {
          ...baseRequest,
          input: ['Hello', 'World', 'Test'],
        }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        // Should show joined text and +N badge
        expect(container.textContent).toContain('Hello')
        expect(container.textContent).toContain('+2')
      }
    })

    test('renders single item array without badge', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'input')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = {
          ...baseRequest,
          input: ['Hello, world!'],
        }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toContain('Hello, world!')
        expect(container.textContent).not.toContain('+')
      }
    })
  })

  describe('inputTokens column', () => {
    test('renders token count', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'inputTokens')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const mockRow = createMockRow(baseRequest)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toBe('4')
      }
    })

    test('renders dash for -1 tokens', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'inputTokens')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = { ...baseRequest, inputTokens: -1 }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toBe('-')
      }
    })

    test('renders single token without formatting', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'inputTokens')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = { ...baseRequest, inputTokens: 1 }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toBe('1')
      }
    })
  })

  describe('dimensions column', () => {
    test('renders dimensions count', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'dimensions')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const mockRow = createMockRow(baseRequest)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toBe('3')
      }
    })

    test('renders large dimensions with formatting', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'dimensions')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = { ...baseRequest, dimensions: 3072 }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toBe('3072')
      }
    })
  })

  describe('duration column', () => {
    test('renders duration in seconds', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'duration')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const mockRow = createMockRow(baseRequest)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toContain('0.15')
      }
    })

    test('renders dash for null duration', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'duration')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = { ...baseRequest, duration: null }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toBe('-')
      }
    })

    test('renders dash for -1 duration', () => {
      const column = columns.find((col) => 'accessorKey' in col && col.accessorKey === 'duration')
      const cell = column?.cell
      if (typeof cell === 'function') {
        const request: EmbeddingRequest = { ...baseRequest, duration: -1 }
        const mockRow = createMockRow(request)
        const result = cell({ row: mockRow } as any)
        const { container } = render(result as any)
        expect(container.textContent).toBe('-')
      }
    })
  })
})
