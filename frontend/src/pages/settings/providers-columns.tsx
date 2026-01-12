import type { ColumnDef } from '@tanstack/react-table'
import { ChevronRightIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import i18n from '@/i18n'
import { ApiKeyCopyButton } from '@/pages/api-keys/api-key-copy-button'

import { ProviderRowActionButton } from './provider-row-action-button'

export interface Provider {
  id: number
  name: string
  type: string
  baseUrl: string
  apiKey: string | null
  deleted: boolean
  createdAt: string
  updatedAt: string
}

export const columns: ColumnDef<Provider>[] = [
  {
    id: 'expand',
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={(e) => {
          e.stopPropagation()
          row.toggleExpanded()
        }}
      >
        <ChevronRightIcon className={cn('h-4 w-4 transition-transform', row.getIsExpanded() && 'rotate-90')} />
      </Button>
    ),
  },
  {
    accessorKey: 'name',
    header: i18n.t('pages.settings.providers.columns.Name'),
  },
  {
    accessorKey: 'type',
    header: i18n.t('pages.settings.providers.columns.Type'),
    cell: ({ row }) => <span className="bg-muted rounded px-2 py-0.5 text-sm">{row.original.type}</span>,
  },
  {
    accessorKey: 'baseUrl',
    header: i18n.t('pages.settings.providers.columns.BaseURL'),
    cell: ({ row }) => <span className="font-mono text-sm">{row.original.baseUrl}</span>,
  },
  {
    accessorKey: 'apiKey',
    header: i18n.t('pages.settings.providers.columns.APIKey'),
    cell: ({ row }) => {
      const apiKey = row.original.apiKey
      return apiKey ? <ApiKeyCopyButton apiKey={apiKey} /> : <span className="text-muted-foreground">-</span>
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <ProviderRowActionButton provider={row.original} />,
  },
]
