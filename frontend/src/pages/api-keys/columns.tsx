import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { CodeXmlIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import i18n from '@/i18n'

import { ApiKeyInvocationGuideButton } from './api-invocation-help'
import { ApiKeyCopyButton } from './api-key-copy-button'
import { RowActionButton } from './row-action-button'

export type ApiKey = Exclude<Awaited<ReturnType<typeof api.admin.apiKey.get>>['data'], null>[number]

export const columns: ColumnDef<ApiKey>[] = [
  {
    accessorKey: 'comment',
    header: i18n.t('pages.api-keys.columns.Name'),
  },
  {
    accessorKey: 'key',
    header: i18n.t('pages.api-keys.columns.APIKey'),
    cell: ({ row }) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { t } = useTranslation()
      return (
        <div className="inline-flex items-center">
          <ApiKeyCopyButton apiKey={row.original.key} revoked={row.original.revoked} />
          <ApiKeyInvocationGuideButton apiKey={row.original.key} asChild>
            <Button variant="ghost" size="sm" title={t('pages.api-keys.invocation-guide.Use')}>
              <CodeXmlIcon />
            </Button>
          </ApiKeyInvocationGuideButton>
        </div>
      )
    },
  },
  {
    accessorKey: 'lastSeen',
    header: i18n.t('pages.api-keys.columns.Lastseen'),
    cell: ({ row }) => {
      if (!row.original.lastSeen) {
        return <div>{i18n.t('pages.api-keys.columns.NeverUse')}</div>
      }
      return <div>{format(row.original.lastSeen, 'yyyy-MM-dd HH:mm')}</div>
    },
  },
  {
    accessorKey: 'createdAt',
    header: i18n.t('pages.api-keys.columns.CreatedAt'),
    cell: ({ row }) => {
      return <div>{format(row.original.createdAt, 'yyyy-MM-dd')}</div>
    },
  },
  {
    accessorKey: 'expiresAt',
    header: i18n.t('pages.api-keys.columns.ExpiresAt'),
    cell: ({ row }) => {
      if (!row.original.expiresAt) {
        return <div>{i18n.t('pages.api-keys.columns.NoExpirationDate')}</div>
      }
      return <div>{format(row.original.expiresAt, 'yyyy-MM-dd')}</div>
    },
  },
  {
    id: 'actions',
    header: i18n.t('pages.api-keys.columns.Actions'),
    cell: ({ row }) => <RowActionButton data={row.original} />,
  },
]
