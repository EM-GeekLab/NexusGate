import type { ComponentProps } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { flexRender, getCoreRowModel, useReactTable, type Table as DTable } from '@tanstack/react-table'
import { format } from 'date-fns'
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn, formatNumber } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { columns, type EmbeddingRequest } from './columns'
import { DetailPanel } from './detail-panel'
import { EmbeddingDetailProvider, useEmbeddingDetail } from './embedding-detail-provider'
import { EmbeddingsDataProvider, useEmbeddingsData } from './embeddings-data-provider'

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100]

export function EmbeddingsDataTable({ data, total }: { data: EmbeddingRequest[]; total: number }) {
  return (
    <EmbeddingsDataProvider data={data} total={total}>
      <EmbeddingDetailProvider>
        <DataTableContainer />
        <DetailPanel />
      </EmbeddingDetailProvider>
    </EmbeddingsDataProvider>
  )
}

function DataTableContainer() {
  const { data } = useEmbeddingsData()
  const { isSelectedEmbedding } = useEmbeddingDetail()

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div
      data-selected={isSelectedEmbedding ? '' : undefined}
      className="@container flex min-w-0 flex-1 flex-col max-lg:data-selected:hidden"
    >
      <DataTable table={table} />
      <DataTableFooter />
    </div>
  )
}

function DataTable({ table }: { table: DTable<EmbeddingRequest> }) {
  const { t } = useTranslation()

  const { selectedEmbeddingId, setSelectedEmbeddingId } = useEmbeddingDetail()

  return (
    <div className="relative flex-1 overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="bg-background sticky top-0">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                tabIndex={0}
                data-active={selectedEmbeddingId === row.original.id ? '' : undefined}
                className="active:bg-accent focus-visible:bg-muted/50 data-active:bg-accent/80 data-active:hover:bg-accent cursor-pointer"
                data-state={row.getIsSelected() && 'selected'}
                onClick={() =>
                  setSelectedEmbeddingId((prev) => (prev === row.original.id ? undefined : row.original.id))
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {t('pages.embeddings.data-table.NoData')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </table>
    </div>
  )
}

function DataTableFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('bg-background flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t p-2', className)}
      {...props}
    >
      <PageInfo />
      <Pagination />
    </div>
  )
}

function PageInfo({ className, ...props }: ComponentProps<'div'>) {
  const { t } = useTranslation()
  const { data, total } = useEmbeddingsData()

  const { page, pageSize } = useSearch({ from: '/embeddings/' })
  const from = (page - 1) * pageSize + 1

  return (
    <div className={cn('pl-2 text-sm @max-4xl:hidden', className)} {...props}>
      {data.length > 0 &&
        t('pages.embeddings.data-table.ShowingRange', {
          from,
          to: Math.min(from + pageSize - 1, total),
          total: formatNumber(total),
          startDate: format(data[data.length - 1].createdAt, 'PP'),
          endDate: format(data[0].createdAt, 'PP'),
        })}
    </div>
  )
}

function Pagination({ className, ...props }: ComponentProps<'div'>) {
  const { t } = useTranslation()

  const { total } = useEmbeddingsData()

  const { page, pageSize, ...rest } = useSearch({ from: '/embeddings/' })
  const pageCount = Math.ceil(total / pageSize)
  const navigate = useNavigate()

  return (
    <div className={cn('flex flex-1 flex-wrap items-center justify-end gap-x-8 gap-y-2', className)} {...props}>
      <div className="flex items-center gap-2">
        <div className="text-sm">{t('pages.embeddings.data-table.Rows')}</div>
        <Select
          value={PAGE_SIZE_OPTIONS.includes(pageSize) ? String(pageSize) : undefined}
          onValueChange={(v) => navigate({ to: '/embeddings', search: { page, pageSize: Number(v), ...rest } })}
        >
          <SelectTrigger className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'font-normal')}>
            <SelectValue placeholder={pageSize} />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm">{t('pages.embeddings.data-table.Page', { page, pageCount })}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="size-8"
            disabled={page <= 1}
            onClick={() =>
              navigate({
                to: '/embeddings',
                search: { page: 1, pageSize, ...rest },
              })
            }
          >
            <ChevronsLeftIcon />
            <span className="sr-only">{t('pages.embeddings.data-table.First')}</span>
          </Button>
          <Button
            variant="outline"
            className="size-8"
            disabled={page <= 1}
            onClick={() =>
              navigate({
                to: '/embeddings',
                search: { page: page - 1, pageSize, ...rest },
              })
            }
          >
            <ChevronLeftIcon />
            <span className="sr-only">{t('pages.embeddings.data-table.Previous')}</span>
          </Button>
          <Button
            variant="outline"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() =>
              navigate({
                to: '/embeddings',
                search: { page: page + 1, pageSize, ...rest },
              })
            }
          >
            <ChevronRightIcon />
            <span className="sr-only">{t('pages.embeddings.data-table.Next')}</span>
          </Button>
          <Button
            variant="outline"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() =>
              navigate({
                to: '/embeddings',
                search: { page: pageCount, pageSize, ...rest },
              })
            }
          >
            <ChevronsRightIcon />
            <span className="sr-only">{t('pages.embeddings.data-table.Last')}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
