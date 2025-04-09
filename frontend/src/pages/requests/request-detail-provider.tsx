import { createContext, useCallback, useContext, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useQuery, type QueryObserverResult, type RefetchOptions } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'

import type { ChatRequest } from './columns'
import { useRequestsData } from './requests-data-provider'

import { useTranslation } from 'react-i18next'

export const RequestDetailContext = createContext<{
  selectedRequestId: number | undefined
  setSelectedRequestId: Dispatch<SetStateAction<number | undefined>>
  selectedRequest: ChatRequest | undefined
  isSelectedRequest: boolean
  isPending: boolean
  error: Error | null
  refetch: (options?: RefetchOptions | undefined) => Promise<QueryObserverResult<ChatRequest | undefined, Error>>
} | null>(null)

export const RequestDetailProvider = ({ children }: { children: ReactNode }) => {
  const { data } = useRequestsData()
  const { selectedRequestId, ...rest } = useSearch({ from: '/requests/' })
  const navigate = useNavigate()

  const {
    data: selectedRequest,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['requests', selectedRequestId],
    queryFn: async () => {
      if (!selectedRequestId) return undefined
      const { data, error } = await api.admin.completions({ id: selectedRequestId }).get()
      if (error) throw formatError(error, 'An error occurred while fetching requests.')
      return data as ChatRequest
    },
    initialData: data.find((request) => request.id === selectedRequestId),
    enabled: !!selectedRequestId,
  })

  const setSelectedRequestId = useCallback(
    (id: (number | undefined) | ((id: number | undefined) => number | undefined)) => {
      const newId = typeof id === 'function' ? id(selectedRequestId) : id
      navigate({
        to: '/requests',
        search: { selectedRequestId: newId, ...rest },
      })
    },
    [navigate, rest, selectedRequestId],
  )

  return (
    <RequestDetailContext.Provider
      value={{
        selectedRequestId,
        setSelectedRequestId,
        selectedRequest,
        isSelectedRequest: selectedRequestId !== undefined,
        isPending,
        error,
        refetch,
      }}
    >
      {children}
    </RequestDetailContext.Provider>
  )
}

export function useRequestDetail() {
  const { t } = useTranslation()

  const context = useContext(RequestDetailContext)
  if (!context) throw new Error(t('Src_pages_requests_request-detail-provider_UseRequestDetailError'))
  return context
}
