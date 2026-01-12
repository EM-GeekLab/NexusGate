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

import type { Provider } from './providers-columns'

import { useTranslation } from 'react-i18next'

const providerSchema = z.object({
  name: z.string().min(1).max(63).optional(),
  type: z.string().max(31).optional(),
  baseUrl: z.string().min(1).max(255).url().optional(),
  apiKey: z.string().max(255).optional(),
})

type ProviderFormValues = z.infer<typeof providerSchema>

interface ProviderEditDialogProps {
  provider: Provider
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProviderEditDialog({ provider, open, onOpenChange }: ProviderEditDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: ProviderFormValues) => {
      const { data, error } = await api.admin.providers({ id: provider.id }).put(values)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      toast.success(t('pages.settings.providers.ProviderUpdated'))
      onOpenChange(false)
    },
    onError: () => {
      toast.error(t('pages.settings.providers.UpdateFailed'))
    },
  })

  const onSubmit = (values: ProviderFormValues) => {
    mutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('pages.settings.providers.EditProvider')}</DialogTitle>
          <DialogDescription>
            {t('pages.settings.providers.EditProviderDescription')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.providers.Name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('pages.settings.providers.NamePlaceholder')} {...field} />
                  </FormControl>
                  <FormDescription>{t('pages.settings.providers.NameDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.providers.Type')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('pages.settings.providers.TypePlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      {/* <SelectItem value="azure">Azure OpenAI</SelectItem> */}
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      {/* <SelectItem value="custom">Custom</SelectItem> */}
                    </SelectContent>
                  </Select>
                  <FormDescription>{t('pages.settings.providers.TypeDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="baseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.providers.BaseURL')}</FormLabel>
                  <FormControl>
                    <Input placeholder="https://api.openai.com/v1" {...field} />
                  </FormControl>
                  <FormDescription>{t('pages.settings.providers.BaseURLDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.providers.APIKey')}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t('pages.settings.providers.APIKeyPlaceholder')} {...field} />
                  </FormControl>
                  <FormDescription>{t('pages.settings.providers.APIKeyDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('pages.settings.providers.Cancel')}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {t('pages.settings.providers.Save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
