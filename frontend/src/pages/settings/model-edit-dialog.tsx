import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { Model } from './models-columns'

import { useTranslation } from 'react-i18next'

const modelSchema = z.object({
  systemName: z.string().min(1).max(63).optional(),
  remoteId: z.string().max(63).optional(),
  modelType: z.enum(['chat', 'embedding']).optional(),
  weight: z.number().min(0).max(100).optional(),
  contextLength: z.number().min(0).nullable().optional(),
})

type ModelFormValues = z.infer<typeof modelSchema>

interface ModelEditDialogProps {
  model: Model
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelEditDialog({ model, open, onOpenChange }: ModelEditDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
    defaultValues: {
      systemName: model.systemName,
      remoteId: model.remoteId ?? '',
      modelType: model.modelType,
      weight: model.weight,
      contextLength: model.contextLength ?? undefined,
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: ModelFormValues) => {
      const { data, error } = await api.admin.models({ id: model.id }).put(values)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      queryClient.invalidateQueries({ queryKey: ['provider-models', model.providerId] })
      toast.success(t('pages.settings.models.ModelUpdated'))
      onOpenChange(false)
    },
    onError: () => {
      toast.error(t('pages.settings.models.UpdateFailed'))
    },
  })

  const onSubmit = (values: ModelFormValues) => {
    mutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('pages.settings.models.EditModel')}</DialogTitle>
          <DialogDescription>
            {t('pages.settings.models.EditModelDescription')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="systemName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.models.SystemName')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('pages.settings.models.SystemNamePlaceholder')} {...field} />
                  </FormControl>
                  <FormDescription>{t('pages.settings.models.SystemNameDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="remoteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.models.RemoteId')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('pages.settings.models.RemoteIdPlaceholder')} {...field} />
                  </FormControl>
                  <FormDescription>{t('pages.settings.models.RemoteIdDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="modelType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.models.ModelType')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('pages.settings.models.ModelTypePlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="chat">{t('pages.settings.models.columns.Chat')}</SelectItem>
                      <SelectItem value="embedding">{t('pages.settings.models.columns.Embedding')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>{t('pages.settings.models.ModelTypeDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.settings.models.Weight')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>{t('pages.settings.models.WeightDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contextLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.settings.models.ContextLength')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="128000"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormDescription>{t('pages.settings.models.ContextLengthDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('pages.settings.models.Cancel')}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {t('pages.settings.models.Save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
