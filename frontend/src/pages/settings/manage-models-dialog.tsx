import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, SearchIcon, SettingsIcon, XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { Model } from './models-columns'
import type { Provider } from './providers-columns'

interface ManageModelsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: Provider
}

interface RemoteModel {
  id: string
  owned_by?: string
}

export function ManageModelsDialog({ open, onOpenChange, provider }: ManageModelsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'saved' | 'remote'>('saved')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch saved models for this provider
  const { data: savedModels = [], isLoading: isLoadingSaved } = useQuery({
    queryKey: ['provider-models', provider.id],
    queryFn: async () => {
      const { data, error } = await api.admin.providers({ id: provider.id }).models.get()
      if (error) throw error
      return data as Model[]
    },
    enabled: open,
  })

  // Fetch remote models from provider
  const {
    data: remoteModels = [],
    isLoading: isLoadingRemote,
    refetch: refetchRemote,
  } = useQuery({
    queryKey: ['provider-remote-models', provider.id],
    queryFn: async () => {
      const { data, error } = await api.admin.providers({ id: provider.id }).test.post()
      if (error) throw error
      // API returns { success: true, models: [...] }
      const response = data as { success: boolean; models: RemoteModel[] }
      return response.models || []
    },
    enabled: open && activeTab === 'remote',
  })

  // Create model mutation
  const createMutation = useMutation({
    mutationFn: async (model: {
      systemName: string
      remoteId?: string
      modelType?: 'chat' | 'embedding'
      contextLength?: number
      inputPrice?: number
      outputPrice?: number
    }) => {
      // Use POST /api/admin/models with providerId in body
      const { data, error } = await api.admin.models.post({
        providerId: provider.id,
        systemName: model.systemName,
        remoteId: model.remoteId || model.systemName,
        modelType: model.modelType,
        contextLength: model.contextLength,
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-models', provider.id] })
      queryClient.invalidateQueries({ queryKey: ['models', 'system-names'] })
      toast.success(t('pages.settings.models.ModelCreated'))
    },
    onError: () => {
      toast.error(t('pages.settings.models.CreateFailed'))
    },
  })

  // Delete model mutation
  const deleteMutation = useMutation({
    mutationFn: async (modelId: number) => {
      const { error } = await api.admin.models({ id: modelId }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-models', provider.id] })
      queryClient.invalidateQueries({ queryKey: ['models', 'system-names'] })
      toast.success(t('pages.settings.models.ModelDeleted'))
    },
    onError: () => {
      toast.error(t('pages.settings.models.DeleteFailed'))
    },
  })

  // Filter remote models based on search query and exclude already saved models
  const savedModelNames = useMemo(() => new Set(savedModels.map((m) => m.remoteId || m.systemName)), [savedModels])

  const filteredRemoteModels = useMemo(() => {
    return remoteModels.filter((model) => {
      const matchesSearch = model.id.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesSearch
    })
  }, [remoteModels, searchQuery])

  const filteredSavedModels = useMemo(() => {
    return savedModels.filter((model) => {
      return model.systemName.toLowerCase().includes(searchQuery.toLowerCase())
    })
  }, [savedModels, searchQuery])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-lg font-semibold">{t('pages.settings.manageModels.Title')}</DialogTitle>
          <p className="text-muted-foreground text-sm">
            for {provider.name}
          </p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'saved' | 'remote')} className="flex flex-col">
          <TabsList className="mx-6 mt-4 w-fit">
            <TabsTrigger value="saved" className="px-6">
              {t('pages.settings.manageModels.SavedModels')} ({savedModels.length})
            </TabsTrigger>
            <TabsTrigger value="remote" className="px-6" onClick={() => refetchRemote()}>
              {t('pages.settings.manageModels.FetchRemoteList')}
            </TabsTrigger>
          </TabsList>

          <div className="px-6 py-4">
            <div className="relative">
              <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                placeholder={t('pages.settings.manageModels.SearchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <TabsContent value="saved" className="mt-0 flex-1 overflow-auto px-6 pb-6">
            <ManualAddForm
              onAdd={(model) => createMutation.mutate(model)}
              isPending={createMutation.isPending}
            />
            <div className="mt-4 max-h-[350px] space-y-3 overflow-y-auto pr-2">
              {isLoadingSaved ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  {t('pages.settings.models.Loading')}
                </div>
              ) : filteredSavedModels.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  {t('pages.settings.models.NoModels')}
                </div>
              ) : (
                filteredSavedModels.map((model) => (
                  <SavedModelItem
                    key={model.id}
                    model={model}
                    onDelete={() => deleteMutation.mutate(model.id)}
                    isDeleting={deleteMutation.isPending}
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="remote" className="mt-0 flex-1 overflow-auto px-6 pb-6">
            <p className="text-muted-foreground mb-4 text-sm">
              {t('pages.settings.manageModels.ClickToAddHint')}
            </p>
            <div className="max-h-[400px] space-y-3 overflow-y-auto pr-2">
              {isLoadingRemote ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  {t('pages.settings.models.Loading')}
                </div>
              ) : filteredRemoteModels.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  {t('pages.settings.manageModels.NoRemoteModels')}
                </div>
              ) : (
                filteredRemoteModels.map((model) => (
                  <RemoteModelItem
                    key={model.id}
                    model={model}
                    isAdded={savedModelNames.has(model.id)}
                    onAdd={(systemName, modelType, contextLength, inputPrice, outputPrice) =>
                      createMutation.mutate({
                        systemName,
                        remoteId: model.id,
                        modelType,
                        contextLength,
                        inputPrice,
                        outputPrice,
                      })
                    }
                    isPending={createMutation.isPending}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

interface ManualAddFormProps {
  onAdd: (model: {
    systemName: string
    remoteId?: string
    modelType?: 'chat' | 'embedding'
    contextLength?: number
    inputPrice?: number
    outputPrice?: number
  }) => void
  isPending: boolean
}

function ManualAddForm({ onAdd, isPending }: ManualAddFormProps) {
  const { t } = useTranslation()
  const [systemName, setSystemName] = useState('')
  const [remoteId, setRemoteId] = useState('')
  const [modelType, setModelType] = useState<'chat' | 'embedding'>('chat')
  const [contextLength, setContextLength] = useState('')
  const [inputPrice, setInputPrice] = useState('')
  const [outputPrice, setOutputPrice] = useState('')

  const handleSubmit = () => {
    if (!systemName.trim()) return
    onAdd({
      systemName: systemName.trim(),
      remoteId: remoteId.trim() || undefined,
      modelType,
      contextLength: contextLength ? Number.parseInt(contextLength) : undefined,
      inputPrice: inputPrice ? Number.parseFloat(inputPrice) : undefined,
      outputPrice: outputPrice ? Number.parseFloat(outputPrice) : undefined,
    })
    setSystemName('')
    setRemoteId('')
    setModelType('chat')
    setContextLength('')
    setInputPrice('')
    setOutputPrice('')
  }

  return (
    <div className="bg-muted/30 space-y-4 rounded-lg border p-4">
      <p className="text-sm font-medium">{t('pages.settings.manageModels.AddManually')}</p>
      <div className="grid grid-cols-3 gap-3">
        <Input
          placeholder={t('pages.settings.manageModels.SystemNamePlaceholder')}
          value={systemName}
          onChange={(e) => setSystemName(e.target.value)}
        />
        <Input
          placeholder={t('pages.settings.manageModels.RemoteIdOptional')}
          value={remoteId}
          onChange={(e) => setRemoteId(e.target.value)}
        />
        <Select value={modelType} onValueChange={(v) => setModelType(v as 'chat' | 'embedding')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chat">{t('pages.settings.manageModels.ModelTypeChat')}</SelectItem>
            <SelectItem value="embedding">{t('pages.settings.manageModels.ModelTypeEmbedding')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input
          placeholder={t('pages.settings.manageModels.ContextLengthOptional')}
          value={contextLength}
          onChange={(e) => setContextLength(e.target.value)}
          type="number"
        />
        <Input
          placeholder={t('pages.settings.manageModels.InputPricePlaceholder')}
          value={inputPrice}
          onChange={(e) => setInputPrice(e.target.value)}
        />
        <Input
          placeholder={t('pages.settings.manageModels.OutputPricePlaceholder')}
          value={outputPrice}
          onChange={(e) => setOutputPrice(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={isPending || !systemName.trim()}>
          {t('pages.settings.manageModels.ManualAdd')}
        </Button>
      </div>
    </div>
  )
}

interface SavedModelItemProps {
  model: Model
  onDelete: () => void
  isDeleting: boolean
}

function SavedModelItem({ model, onDelete, isDeleting }: SavedModelItemProps) {
  const [showConfig, setShowConfig] = useState(false)

  const priceInfo = []
  if (model.inputPrice) priceInfo.push(`$${model.inputPrice}`)
  if (model.outputPrice) priceInfo.push(`$${model.outputPrice}`)
  const priceText = priceInfo.length > 0 ? priceInfo.join('/') + ' per 1M' : null

  return (
    <div className="rounded-lg border bg-white p-4 dark:bg-zinc-900">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium">{model.systemName}</p>
          <p className="text-muted-foreground text-sm">
            Remote: {model.remoteId || model.systemName}
            {model.contextLength && ` · Ctx: ${model.contextLength.toLocaleString()}`}
            {priceText && ` · ${priceText}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setShowConfig(!showConfig)}
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
      {showConfig && (
        <ModelConfigForm model={model} onClose={() => setShowConfig(false)} />
      )}
    </div>
  )
}

interface ModelConfigFormProps {
  model: Model
  onClose: () => void
}

function ModelConfigForm({ model, onClose }: ModelConfigFormProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [systemName, setSystemName] = useState(model.systemName)
  const [contextLength, setContextLength] = useState(model.contextLength?.toString() || '')
  const [inputPrice, setInputPrice] = useState(model.inputPrice?.toString() || '')
  const [outputPrice, setOutputPrice] = useState(model.outputPrice?.toString() || '')

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.admin.models({ id: model.id }).put({
        systemName,
        contextLength: contextLength ? Number.parseInt(contextLength) : undefined,
        inputPrice: inputPrice ? Number.parseFloat(inputPrice) : undefined,
        outputPrice: outputPrice ? Number.parseFloat(outputPrice) : undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-models', model.providerId] })
      queryClient.invalidateQueries({ queryKey: ['models', 'system-names'] })
      toast.success(t('pages.settings.models.ModelUpdated'))
      onClose()
    },
    onError: () => {
      toast.error(t('pages.settings.models.UpdateFailed'))
    },
  })

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <p className="text-sm font-medium">{t('pages.settings.manageModels.ConfigureSystemName')}</p>
      <Input
        placeholder={t('pages.settings.manageModels.SystemNamePlaceholder')}
        value={systemName}
        onChange={(e) => setSystemName(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-3">
        <Input
          placeholder={t('pages.settings.manageModels.ContextLengthOptional')}
          value={contextLength}
          onChange={(e) => setContextLength(e.target.value)}
          type="number"
        />
        <Input
          placeholder={t('pages.settings.manageModels.InputPricePlaceholder')}
          value={inputPrice}
          onChange={(e) => setInputPrice(e.target.value)}
        />
        <Input
          placeholder={t('pages.settings.manageModels.OutputPricePlaceholder')}
          value={outputPrice}
          onChange={(e) => setOutputPrice(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('pages.settings.models.Cancel')}
        </Button>
        <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
          {t('pages.settings.manageModels.Confirm')}
        </Button>
      </div>
    </div>
  )
}

interface RemoteModelItemProps {
  model: RemoteModel
  isAdded: boolean
  onAdd: (systemName: string, modelType: 'chat' | 'embedding', contextLength?: number, inputPrice?: number, outputPrice?: number) => void
  isPending: boolean
}

function RemoteModelItem({ model, isAdded, onAdd, isPending }: RemoteModelItemProps) {
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [systemName, setSystemName] = useState(model.id)
  const [modelType, setModelType] = useState<'chat' | 'embedding'>('chat')
  const [contextLength, setContextLength] = useState('')
  const [inputPrice, setInputPrice] = useState('')
  const [outputPrice, setOutputPrice] = useState('')

  const handleAdd = () => {
    onAdd(
      systemName,
      modelType,
      contextLength ? Number.parseInt(contextLength) : undefined,
      inputPrice ? Number.parseFloat(inputPrice) : undefined,
      outputPrice ? Number.parseFloat(outputPrice) : undefined,
    )
    setShowForm(false)
  }

  if (isAdded) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
        <div>
          <p className="font-medium">{model.id}</p>
          <p className="text-muted-foreground text-sm">Owner: {model.owned_by || 'unknown'}</p>
        </div>
        <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1 rounded px-2 py-1 text-xs">
          <CheckIcon className="size-3" />
          {t('pages.settings.manageModels.Configured')}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white p-4 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{model.id}</p>
          <p className="text-muted-foreground text-sm">Owner: {model.owned_by || 'unknown'}</p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} disabled={isPending}>
            {t('pages.settings.manageModels.Add')}
          </Button>
        )}
      </div>
      {showForm && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <p className="text-sm font-medium">{t('pages.settings.manageModels.ConfigureSystemName')}</p>
          <div className="grid grid-cols-3 gap-3">
            <Input
              className="col-span-2"
              placeholder={model.id}
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
            />
            <Select value={modelType} onValueChange={(v) => setModelType(v as 'chat' | 'embedding')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">{t('pages.settings.manageModels.ModelTypeChat')}</SelectItem>
                <SelectItem value="embedding">{t('pages.settings.manageModels.ModelTypeEmbedding')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              placeholder={t('pages.settings.manageModels.ContextLengthOptional')}
              value={contextLength}
              onChange={(e) => setContextLength(e.target.value)}
              type="number"
            />
            <Input
              placeholder={t('pages.settings.manageModels.InputPricePlaceholder')}
              value={inputPrice}
              onChange={(e) => setInputPrice(e.target.value)}
            />
            <Input
              placeholder={t('pages.settings.manageModels.OutputPricePlaceholder')}
              value={outputPrice}
              onChange={(e) => setOutputPrice(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
              {t('pages.settings.models.Cancel')}
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={isPending}>
              {t('pages.settings.manageModels.Confirm')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
