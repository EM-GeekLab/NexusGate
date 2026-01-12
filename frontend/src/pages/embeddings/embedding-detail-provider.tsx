import { createContext, useCallback, useContext, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

type EmbeddingDetailContextValue = {
  selectedEmbeddingId: number | undefined
  setSelectedEmbeddingId: Dispatch<SetStateAction<number | undefined>>
  isSelectedEmbedding: boolean
}

const EmbeddingDetailContext = createContext<EmbeddingDetailContextValue | undefined>(undefined)

export function EmbeddingDetailProvider({ children }: { children: ReactNode }) {
  const { selectedEmbeddingId, ...rest } = useSearch({ from: '/embeddings/' })
  const navigate = useNavigate()

  const setSelectedEmbeddingId = useCallback<Dispatch<SetStateAction<number | undefined>>>(
    (value) => {
      navigate({
        to: '/embeddings',
        search: {
          selectedEmbeddingId: typeof value === 'function' ? value(selectedEmbeddingId) : value,
          ...rest,
        },
      })
    },
    [navigate, rest, selectedEmbeddingId],
  )

  return (
    <EmbeddingDetailContext.Provider
      value={{ selectedEmbeddingId, setSelectedEmbeddingId, isSelectedEmbedding: selectedEmbeddingId !== undefined }}
    >
      {children}
    </EmbeddingDetailContext.Provider>
  )
}

export function useEmbeddingDetail() {
  const context = useContext(EmbeddingDetailContext)
  if (context === undefined) {
    throw new Error('useEmbeddingDetail must be used within a EmbeddingDetailProvider')
  }
  return context
}
