import type { ColumnDef } from '@tanstack/react-table'

import { IndicatorBadge } from '@/components/ui/indicator-badge'

import { ModelRowActionButton } from './model-row-action-button'

import i18n from '@/i18n'

export interface Model {
  id: number
  providerId: number
  systemName: string
  remoteId: string | null
  modelType: 'chat' | 'embedding'
  weight: number
  contextLength: number | null
  inputPrice: string | null
  outputPrice: string | null
  createdAt: string
  updatedAt: string
}

export const columns: ColumnDef<Model>[] = [
  {
    accessorKey: 'systemName',
    header: i18n.t('pages.settings.models.columns.SystemName'),
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.systemName}</span>
    ),
  },
  {
    accessorKey: 'remoteId',
    header: i18n.t('pages.settings.models.columns.RemoteId'),
    cell: ({ row }) => (
      <span className="font-mono text-sm text-muted-foreground">
        {row.original.remoteId ?? row.original.systemName}
      </span>
    ),
  },
  {
    accessorKey: 'modelType',
    header: i18n.t('pages.settings.models.columns.ModelType'),
    cell: ({ row }) => {
      const type = row.original.modelType
      return (
        <IndicatorBadge className={type === 'chat' ? 'bg-blue-500' : 'bg-purple-500'}>
          {type === 'chat'
            ? i18n.t('pages.settings.models.columns.Chat')
            : i18n.t('pages.settings.models.columns.Embedding')}
        </IndicatorBadge>
      )
    },
  },
  {
    accessorKey: 'weight',
    header: i18n.t('pages.settings.models.columns.Weight'),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.weight.toFixed(2)}</span>
    ),
  },
  {
    accessorKey: 'contextLength',
    header: i18n.t('pages.settings.models.columns.ContextLength'),
    cell: ({ row }) => {
      const ctx = row.original.contextLength
      return ctx ? <span className="tabular-nums">{ctx.toLocaleString()}</span> : '-'
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <ModelRowActionButton model={row.original} />,
  },
]
