import { createContext, useContext, type ReactNode } from 'react'

import type { ChatRequest } from './columns'

import { useTranslation } from 'react-i18next'

const RequestsDataContext = createContext<{
  data: ChatRequest[]
  total: number
} | null>(null)

export const RequestsDataProvider = ({
  children,
  data,
  total,
}: {
  children: ReactNode
  data: ChatRequest[]
  total: number
}) => {
  return <RequestsDataContext.Provider value={{ data, total }}>{children}</RequestsDataContext.Provider>
}

export function useRequestsData() {
  const { t } = useTranslation()
  
  const ctx = useContext(RequestsDataContext)
  if (!ctx) throw new Error(t('useRequestData must be used within a RequestDataProvider'))
  return ctx
}
