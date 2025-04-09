import { useNavigate } from '@tanstack/react-router'
import { Settings2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { AddButton } from './add-button'
import { columns, type ApiKey } from './columns'

import { useTranslation } from 'react-i18next'

export function ApiKeysDataTable({ data, includeRevoked }: { data: ApiKey[]; includeRevoked: boolean }) {
  return (
    <div className="py-4">
      <div className="flex items-center pb-4">
        <AddButton size="sm" />
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
        <Button variant="outline" size="sm" className="ml-auto">
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
