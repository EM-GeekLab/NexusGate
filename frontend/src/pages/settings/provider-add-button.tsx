import { useState, type ComponentProps } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PROVIDER_TYPES = ['openai', 'openai-responses', 'anthropic', 'azure', 'ollama'] as const

const providerSchema = z.object({
  name: z.string().min(1).max(63),
  type: z.enum(PROVIDER_TYPES).default('openai'),
  baseUrl: z.string().min(1).max(255).url(),
  apiKey: z.string().max(255).optional(),
  apiVersion: z.string().max(31).optional(),
})

type ProviderFormValues = z.infer<typeof providerSchema>

export function ProviderAddButton({ size = 'default', ...props }: ComponentProps<typeof Button>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: '',
      type: 'openai',
      baseUrl: '',
      apiKey: '',
      apiVersion: '',
    },
  })

  const watchType = form.watch('type')

  const mutation = useMutation({
    mutationFn: async (values: ProviderFormValues) => {
      const { data, error } = await api.admin.providers.post(values)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      toast.success(t('pages.settings.providers.ProviderCreated'))
      setOpen(false)
      form.reset()
    },
    onError: () => {
      toast.error(t('pages.settings.providers.CreateFailed'))
    },
  })

  const onSubmit = (values: ProviderFormValues) => {
    mutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} {...props}>
          <PlusIcon className="mr-2 h-4 w-4" />
          {t('pages.settings.providers.NewProvider')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('pages.settings.providers.AddProvider')}</DialogTitle>
          <DialogDescription>{t('pages.settings.providers.AddProviderDescription')}</DialogDescription>
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
                      <SelectItem value="openai">OpenAI Chat API</SelectItem>
                      <SelectItem value="openai-responses">OpenAI Response API</SelectItem>
                      <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                      <SelectItem value="azure">Azure OpenAI</SelectItem>
                      <SelectItem value="ollama">Ollama</SelectItem>
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
            {(watchType === 'anthropic' || watchType === 'azure') && (
              <FormField
                control={form.control}
                name="apiVersion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.settings.providers.APIVersion')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={watchType === 'anthropic' ? '2023-06-01' : '2024-02-15-preview'}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('pages.settings.providers.APIVersionDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
