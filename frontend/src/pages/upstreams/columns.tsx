import type { ColumnDef } from '@tanstack/react-table'

import type { api } from '@/lib/api'
import { ApiKeyCopyButton } from '@/pages/api-keys/api-key-copy-button'

import { RowActionButton } from './row-action-button'

import i18n from '@/i18n'

export type Upstream = Exclude<Awaited<ReturnType<typeof api.admin.upstream.get>>['data'], null>[number]

export const columns: ColumnDef<Upstream>[] = [
  {
    accessorKey: 'name',
    header: i18n.t('pages.upstreams.columns.ProviderName'),
  },
  {
    accessorKey: 'model',
    header: i18n.t('pages.upstreams.columns.Model'),
  },
  {
    accessorKey: 'upstreamModel',
    header: i18n.t('pages.upstreams.columns.ProviderModel'),
  },
  {
    accessorKey: 'url',
    header: i18n.t('pages.upstreams.columns.BaseURL'),
  },
  {
    accessorKey: 'apiKey',
    header: i18n.t('pages.upstreams.columns.APIKey'),
    cell: ({ row }) => {
      const apiKey = row.original.apiKey
      return apiKey ? <ApiKeyCopyButton apiKey={apiKey} /> : null
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <RowActionButton data={row.original} />,
  },
]
