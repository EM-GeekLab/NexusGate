import { useNavigate } from '@tanstack/react-router'
import { CodeXmlIcon, Settings2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { AddButton } from './add-button'
import { ApiKeyInvocationGuideButton } from './api-invocation-help'
import { columns, type ApiKey } from './columns'

export function ApiKeysDataTable({ data, includeRevoked }: { data: ApiKey[]; includeRevoked: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="py-4">
      <div className="flex items-center gap-4 pb-4">
        <AddButton size="sm" />
        <div className="flex-grow" />
        <ApiKeyInvocationGuideButton asChild>
          <Button variant="outline" size="sm">
            <CodeXmlIcon />
            {t('pages.api-keys.invocation-guide.APIInvocationGuide')}
          </Button>
        </ApiKeyInvocationGuideButton>
        <ApiKeysViewOptions includeRevoked={includeRevoked} />
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  )
}

function ApiKeysViewOptions({ includeRevoked }: { includeRevoked: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2Icon />
          {t('pages.api-keys.data-table.View')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={includeRevoked}
          onCheckedChange={(v) => {
            navigate({
              to: '/apps',
              search: { includeRevoked: v },
            })
          }}
        >
          {t('pages.api-keys.data-table.ShowRevoked')}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
