import { createContext, useContext, type ReactNode } from 'react'

import type { EmbeddingRequest } from './columns'

type EmbeddingsDataContextValue = {
  data: EmbeddingRequest[]
  total: number
}

const EmbeddingsDataContext = createContext<EmbeddingsDataContextValue | undefined>(undefined)

export function EmbeddingsDataProvider({
  data,
  total,
  children,
}: {
  data: EmbeddingRequest[]
  total: number
  children: ReactNode
}) {
  return <EmbeddingsDataContext.Provider value={{ data, total }}>{children}</EmbeddingsDataContext.Provider>
}

export function useEmbeddingsData() {
  const context = useContext(EmbeddingsDataContext)
  if (context === undefined) {
    throw new Error('useEmbeddingsData must be used within a EmbeddingsDataProvider')
  }
  return context
}
