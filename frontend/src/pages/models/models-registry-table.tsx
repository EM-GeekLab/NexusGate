import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, getExpandedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDownIcon, ChevronRightIcon, SaveIcon, XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IndicatorBadge } from '@/components/ui/indicator-badge'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import i18n from '@/i18n'
import type { Model } from '@/pages/settings/models-columns'

interface SystemNameRow {
  systemName: string
}

const columns: ColumnDef<SystemNameRow>[] = [
  {
    id: 'expander',
    header: () => null,
    cell: ({ row }) => (
      <button onClick={() => row.toggleExpanded()} className="cursor-pointer p-1">
        {row.getIsExpanded() ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
      </button>
    ),
  },
  {
    accessorKey: 'systemName',
    header: i18n.t('pages.models.registry.SystemName'),
    cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.systemName}</span>,
  },
]

export function ModelsRegistryTable({ systemNames }: { systemNames: string[] }) {
  const { t } = useTranslation()

  const data: SystemNameRow[] = systemNames.map((name) => ({ systemName: name }))

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  })

  return (
    <div className="py-4">
      <div className="flex items-center justify-between pb-4">
        <h2 className="text-lg font-semibold">{t('pages.models.registry.Title')}</h2>
      </div>
      <div className="rounded-md border">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="bg-muted/50 p-4">
                        <ModelsBySystemNameTable systemName={row.original.systemName} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t('pages.models.registry.NoModels')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
    </div>
  )
}

interface ModelWithProvider {
  model: Model
  provider: {
    id: number
    name: string
    type: string
    baseUrl: string
  }
}

function ModelsBySystemNameTable({ systemName }: { systemName: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  const [editedWeights, setEditedWeights] = useState<Record<number, number>>({})

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['models', 'by-system-name', systemName],
    queryFn: async () => {
      const { data, error } = await api.admin.models['by-system-name'][systemName].get()
      if (error) throw error
      return data as ModelWithProvider[]
    },
  })

  const updateWeightsMutation = useMutation({
    mutationFn: async (weights: { modelId: number; weight: number }[]) => {
      const { error } = await api.admin.models['by-system-name'][systemName].weights.put({
        weights,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models', 'by-system-name', systemName] })
      toast.success(t('pages.models.registry.WeightsUpdated'))
      setEditMode(false)
      setEditedWeights({})
    },
    onError: () => {
      toast.error(t('pages.models.registry.WeightsUpdateFailed'))
    },
  })

  const handleEditStart = () => {
    const weights: Record<number, number> = {}
    for (const m of models) {
      weights[m.model.id] = m.model.weight
    }
    setEditedWeights(weights)
    setEditMode(true)
  }

  const handleSave = () => {
    const weights = Object.entries(editedWeights).map(([modelId, weight]) => ({
      modelId: Number(modelId),
      weight,
    }))
    updateWeightsMutation.mutate(weights)
  }

  const handleCancel = () => {
    setEditMode(false)
    setEditedWeights({})
  }

  const totalWeight = editMode
    ? Object.values(editedWeights).reduce((sum, w) => sum + w, 0)
    : models.reduce((sum, m) => sum + m.model.weight, 0)

  if (isLoading) {
    return <div className="text-muted-foreground py-4 text-center">{t('pages.models.registry.Loading')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{t('pages.models.registry.ProvidersForModel')}</h4>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <XIcon className="mr-1 size-4" />
                {t('pages.models.registry.Cancel')}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateWeightsMutation.isPending}>
                <SaveIcon className="mr-1 size-4" />
                {t('pages.models.registry.Save')}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={handleEditStart}>
              {t('pages.models.registry.EditWeights')}
            </Button>
          )}
        </div>
      </div>

      {models.length > 0 ? (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t('pages.models.registry.Provider')}</TableHead>
                <TableHead>{t('pages.models.registry.RemoteId')}</TableHead>
                <TableHead>{t('pages.models.registry.ModelType')}</TableHead>
                <TableHead>{t('pages.models.registry.Weight')}</TableHead>
                <TableHead className="text-right">{t('pages.models.registry.Probability')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => {
                const weight = editMode ? (editedWeights[m.model.id] ?? m.model.weight) : m.model.weight
                const probability = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0.0'

                return (
                  <TableRow key={m.model.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{m.provider.name}</span>
                        <span className="text-muted-foreground text-xs">{m.provider.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs">
                        {m.model.remoteId ?? m.model.systemName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <IndicatorBadge className={m.model.modelType === 'chat' ? 'bg-blue-500' : 'bg-purple-500'}>
                        {m.model.modelType === 'chat'
                          ? i18n.t('pages.settings.models.columns.Chat')
                          : i18n.t('pages.settings.models.columns.Embedding')}
                      </IndicatorBadge>
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          value={editedWeights[m.model.id] ?? m.model.weight}
                          onChange={(e) =>
                            setEditedWeights((prev) => ({
                              ...prev,
                              [m.model.id]: Number.parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="h-8 w-20"
                        />
                      ) : (
                        <span className="tabular-nums">{m.model.weight.toFixed(2)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="tabular-nums">{probability}%</span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </table>
        </div>
      ) : (
        <div className="text-muted-foreground py-4 text-center text-sm">{t('pages.models.registry.NoProviders')}</div>
      )}
    </div>
  )
}
