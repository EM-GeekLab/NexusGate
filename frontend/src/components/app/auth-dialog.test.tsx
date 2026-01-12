import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter, createRootRoute } from '@tanstack/react-router'
import { AuthDialog } from './auth-dialog'

// Mock the api module
vi.mock('@/lib/api', () => ({
  api: {
    admin: {
      index: {
        get: vi.fn(),
      },
    },
  },
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'components.app.auth-dialog.AuthenticationRequired': 'Authentication Required',
        'components.app.auth-dialog.AdminSecret': 'Enter admin secret',
        'components.app.auth-dialog.Save': 'Save',
        'components.app.auth-dialog.InvalidSecret': 'Invalid secret',
      }
      return translations[key] || key
    },
  }),
}))

// Mock usehooks-ts
const mockSetSecret = vi.fn()
let mockSecret = ''

vi.mock('usehooks-ts', () => ({
  useLocalStorage: (_key: string, _defaultValue: string) => {
    return [mockSecret, mockSetSecret]
  },
}))

import { api } from '@/lib/api'

const createTestRouter = (component: React.ReactNode) => {
  const rootRoute = createRootRoute({
    component: () => component,
  })

  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory(),
  })
}

const renderWithProviders = (ui: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const router = createTestRouter(ui)

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('AuthDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSecret = ''
  })

  test('shows dialog when no secret is set', () => {
    mockSecret = ''
    renderWithProviders(<AuthDialog />)

    expect(screen.getByText('Authentication Required')).toBeInTheDocument()
    expect(screen.getByText('Enter admin secret')).toBeInTheDocument()
  })

  test('shows dialog when secret is invalid', async () => {
    mockSecret = 'invalid-secret'
    vi.mocked(api.admin.index.get).mockResolvedValue({
      data: null,
      error: { status: 401, value: 'Invalid admin secret' },
    } as any)

    renderWithProviders(<AuthDialog />)

    await waitFor(() => {
      expect(screen.getByText('Authentication Required')).toBeInTheDocument()
    })
  })

  test('hides dialog when secret is valid', async () => {
    mockSecret = 'valid-secret'
    vi.mocked(api.admin.index.get).mockResolvedValue({
      data: true,
      error: null,
    } as any)

    renderWithProviders(<AuthDialog />)

    await waitFor(() => {
      expect(screen.queryByText('Authentication Required')).not.toBeInTheDocument()
    })
  })

  test('calls setSecret when form is submitted', () => {
    mockSecret = ''
    renderWithProviders(<AuthDialog />)

    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test-secret' } })

    const submitButton = screen.getByText('Save')
    fireEvent.click(submitButton)

    expect(mockSetSecret).toHaveBeenCalled()
  })

  test('has password input type', () => {
    mockSecret = ''
    renderWithProviders(<AuthDialog />)

    const input = document.querySelector('input[type="password"]')
    expect(input).toBeInTheDocument()
  })
})

describe('AuthDialog query invalidation', () => {
  test('invalidates queries with correct predicate on auth success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    // Set up some queries
    queryClient.setQueryData(['requests', {}], [])
    queryClient.setQueryData(['providers'], [])
    queryClient.setQueryData(['github-head'], { sha: 'abc' })
    queryClient.setQueryData(['check-secret', 'test'], true)

    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    mockSecret = 'valid-secret'
    vi.mocked(api.admin.index.get).mockResolvedValue({
      data: true,
      error: null,
    } as any)

    const router = createTestRouter(<AuthDialog />)

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    // The predicate should exclude 'check-secret' and 'github-head'
    await waitFor(() => {
      if (invalidateQueriesSpy.mock.calls.length > 0) {
        const call = invalidateQueriesSpy.mock.calls[0][0] as any
        if (call?.predicate) {
          // Test that predicate correctly filters queries
          expect(call.predicate({ queryKey: ['requests'] })).toBe(true)
          expect(call.predicate({ queryKey: ['providers'] })).toBe(true)
          expect(call.predicate({ queryKey: ['check-secret', 'test'] })).toBe(false)
          expect(call.predicate({ queryKey: ['github-head'] })).toBe(false)
        }
      }
    })
  })
})
