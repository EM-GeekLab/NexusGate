import { Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { api } from '@/lib/api'
import { DataTable } from '@/components/ui/data-table'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { columns as modelColumns, type Model } from './models-columns'
import { ModelAddButton } from './model-add-button'
import { ProviderAddButton } from './provider-add-button'
import { columns, type Provider } from './providers-columns'

import { useTranslation } from 'react-i18next'

export function ProvidersDataTable({ data }: { data: Provider[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  })

  return (
    <div className="py-4">
      <div className="flex items-center pb-4">
        <ProviderAddButton size="sm" />
      </div>
      <div className="rounded-md border">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className="cursor-pointer"
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={() => row.toggleExpanded()}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="bg-muted/50 p-4">
                        <ProviderModelsTable providerId={row.original.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No providers configured.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
    </div>
  )
}

function ProviderModelsTable({ providerId }: { providerId: number }) {
  const { t } = useTranslation()

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['provider-models', providerId],
    queryFn: async () => {
      const { data, error } = await api.admin.providers({ id: providerId }).models.get()
      if (error) throw error
      return data as Model[]
    },
  })

  if (isLoading) {
    return <div className="text-muted-foreground py-4 text-center">{t('pages.settings.models.Loading')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{t('pages.settings.models.ConfiguredModels')}</h4>
        <ModelAddButton providerId={providerId} />
      </div>
      {models.length > 0 ? (
        <DataTable columns={modelColumns} data={models} />
      ) : (
        <div className="text-muted-foreground py-4 text-center text-sm">
          {t('pages.settings.models.NoModels')}
        </div>
      )}
    </div>
  )
}
