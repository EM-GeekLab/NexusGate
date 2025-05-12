import { createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { ChatRequest } from './columns'

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
  if (!ctx) throw new Error(t('pages.requests.requests-data-provider.UseRequestDataError'))
  return ctx
}
