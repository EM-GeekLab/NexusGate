import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CpuIcon, HistoryIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { Model } from './models-columns'

interface ModelWithProvider {
  model: Model
  provider: {
    id: number
    name: string
    type: string
    baseUrl: string
  }
}

export function ModelsSettingsPage({ systemNames }: { systemNames: string[] }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{t('pages.models.registry.Title')}</CardTitle>
          <CardDescription className="text-sm">{t('pages.models.registry.Description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {systemNames.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">{t('pages.models.registry.SystemName')}</TableHead>
                  <TableHead className="w-[100px]">{t('pages.models.registry.ModelType')}</TableHead>
                  <TableHead>{t('pages.models.registry.ProvidersAndRemoteId')}</TableHead>
                  <TableHead className="w-[100px] text-center">{t('pages.models.registry.History')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemNames.map((systemName) => (
                  <ModelRow key={systemName} systemName={systemName} />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground py-12 text-center text-sm">{t('pages.models.registry.NoModels')}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ModelRow({ systemName }: { systemName: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showDialog, setShowDialog] = useState(false)

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['models', 'by-system-name', systemName],
    queryFn: async () => {
      const { data, error } = await api.admin.models['by-system-name'][systemName].get()
      if (error) throw error
      return data as ModelWithProvider[]
    },
  })

  // Check if model has no providers (unavailable)
  const isUnavailable = !isLoading && models.length === 0

  // Get model type from first model (all models with same systemName should have same type)
  const modelType = models.length > 0 ? models[0].model.modelType : null

  const handleHistoryClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (modelType === 'embedding') {
      navigate({ to: '/embeddings', search: { model: systemName } })
    } else {
      navigate({ to: '/requests', search: { model: systemName } })
    }
  }

  return (
    <>
      <TableRow
        className={`hover:bg-muted/50 cursor-pointer ${isUnavailable ? 'opacity-50' : ''}`}
        onClick={() => !isUnavailable && setShowDialog(true)}
      >
        <TableCell>
          <div className="flex items-center gap-3">
            <CpuIcon className={`size-5 ${isUnavailable ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
            <span
              className={`font-mono text-sm font-medium ${isUnavailable ? 'text-muted-foreground line-through' : ''}`}
            >
              {systemName}
            </span>
          </div>
        </TableCell>
        <TableCell>
          {isLoading ? (
            <span className="text-muted-foreground text-sm">-</span>
          ) : modelType ? (
            <Badge variant={modelType === 'chat' ? 'default' : 'secondary'} className="text-xs">
              {modelType === 'chat'
                ? t('pages.settings.models.columns.Chat')
                : t('pages.settings.models.columns.Embedding')}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </TableCell>
        <TableCell>
          {isLoading ? (
            <span className="text-muted-foreground text-sm">{t('pages.models.registry.Loading')}</span>
          ) : isUnavailable ? (
            <span className="text-muted-foreground text-sm italic">{t('pages.models.registry.NoProviders')}</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {models.map((m) => (
                <Badge key={m.model.id} variant="outline" className="gap-1.5 px-2.5 py-1 font-mono text-xs">
                  <span>{m.provider.name}</span>
                  <span className="text-muted-foreground">:</span>
                  <span className="text-muted-foreground">{m.model.remoteId || m.model.systemName}</span>
                  <span className="bg-primary/20 text-primary ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                    {m.model.weight}
                  </span>
                </Badge>
              ))}
            </div>
          )}
        </TableCell>
        <TableCell className="text-center">
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0"
            onClick={handleHistoryClick}
            title={t('pages.models.registry.ViewHistory')}
          >
            <HistoryIcon className="size-4" />
          </Button>
        </TableCell>
      </TableRow>

      <LoadBalancingDialog open={showDialog} onOpenChange={setShowDialog} systemName={systemName} models={models} />
    </>
  )
}

interface LoadBalancingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  systemName: string
  models: ModelWithProvider[]
}

function LoadBalancingDialog({ open, onOpenChange, systemName, models }: LoadBalancingDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editedWeights, setEditedWeights] = useState<Record<number, number>>({})

  // Initialize weights when dialog opens or models change
  useEffect(() => {
    if (open) {
      const weights: Record<number, number> = {}
      for (const m of models) {
        weights[m.model.id] = m.model.weight
      }
      setEditedWeights(weights)
    }
  }, [open, models])

  const updateWeightsMutation = useMutation({
    mutationFn: async (weights: { modelId: number; weight: number }[]) => {
      const { error } = await api.admin.models['by-system-name'][systemName].weights.put({
        weights,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models', 'by-system-name', systemName] })
      queryClient.invalidateQueries({ queryKey: ['models', 'system-names'] })
      toast.success(t('pages.models.registry.WeightsUpdated'))
      onOpenChange(false)
    },
    onError: () => {
      toast.error(t('pages.models.registry.WeightsUpdateFailed'))
    },
  })

  const handleSave = () => {
    const weights = Object.entries(editedWeights).map(([modelId, weight]) => ({
      modelId: Number(modelId),
      weight,
    }))
    updateWeightsMutation.mutate(weights)
  }

  const totalWeight = Object.values(editedWeights).reduce((sum, w) => sum + w, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{t('pages.models.loadbalancing.Title')}</DialogTitle>
          <p className="text-muted-foreground text-sm">
            {t('pages.models.loadbalancing.TargetModel')}: <code className="text-primary font-mono">{systemName}</code>
          </p>
        </DialogHeader>

        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pages.models.loadbalancing.Provider')}</TableHead>
                <TableHead className="w-[140px]">{t('pages.models.loadbalancing.Weight')}</TableHead>
                <TableHead className="w-[100px] text-right">{t('pages.models.loadbalancing.Probability')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => {
                const weight = editedWeights[m.model.id] ?? m.model.weight
                const probability = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0.0'

                return (
                  <TableRow key={m.model.id}>
                    <TableCell>
                      <span className="font-medium">{m.provider.name}</span>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editedWeights[m.model.id] ?? m.model.weight}
                        onChange={(e) =>
                          setEditedWeights((prev) => ({
                            ...prev,
                            [m.model.id]: Number.parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="h-9 w-24"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-primary font-mono text-sm font-semibold tabular-nums">{probability}%</span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('pages.models.registry.Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={updateWeightsMutation.isPending}>
            {t('pages.models.registry.Save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
