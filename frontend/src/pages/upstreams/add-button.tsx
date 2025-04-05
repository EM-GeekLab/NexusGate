import { useState, type ComponentProps } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { api } from '@/lib/api'
import { newApiError } from '@/lib/error'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

import { useTranslation } from 'react-i18next'

const addUpstreamSchema = z.object({
  name: z.string(),
  model: z.string(),
  upstreamModel: z.string().optional(),
  url: z.string(),
  apiKey: z.string().optional(),
})

type AddUpstreamSchema = z.infer<typeof addUpstreamSchema>

export function AddButton({ ...props }: ComponentProps<typeof Button>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button {...props}>
          <PlusIcon />
          {t('New.provider')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Add.a.new.model.provider')}</DialogTitle>
          <DialogDescription>{t('Add.a.model.provider.for.downstream.application.integration.')}</DialogDescription>
        </DialogHeader>
        <AddUpstreamForm onSubmitSuccessful={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AddUpstreamForm({ onSubmitSuccessful }: { onSubmitSuccessful: () => void }) {
  const { t } = useTranslation()
  
  const queryClient = useQueryClient()
  const { mutate, isPending, isError, error } = useMutation({
    mutationFn: async (values: AddUpstreamSchema) => {
      const { error } = await api.admin.upstream.post(values)
      if (error) throw newApiError(error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upstreams'] })
      toast.success('Provider added.')
      onSubmitSuccessful()
    },
  })

  const form = useForm<AddUpstreamSchema>({
    resolver: zodResolver(addUpstreamSchema),
  })

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={form.handleSubmit((v) => mutate(v))}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Provider.name')}</FormLabel>
              <FormControl>
                <Input placeholder="DeepSeek" {...field} />
              </FormControl>
              <FormDescription>{t('Name.to.identify.the.provider.')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="model"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Model.name')}</FormLabel>
              <FormControl>
                <Input placeholder="deepseek-r1" {...field} />
              </FormControl>
              <FormDescription>{t('Custom.model.name.for.downstream.applications.')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="upstreamModel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Provider.model.name')}</FormLabel>
              <FormControl>
                <Input placeholder="deepseek-reasoner" {...field} />
              </FormControl>
              <FormDescription>{t('Model.name.used.by.the.provider.')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Base.URL')}</FormLabel>
              <FormControl>
                <Input placeholder="https://api.deepseek.com" {...field} />
              </FormControl>
              <FormDescription>{t('API.endpoint.URL.of.the.provider.')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('API.key')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {isError && <p className="text-destructive">{error.message}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('Cancel')}
            </Button>
          </DialogClose>
          <Button type="submit">
            {isPending && <Spinner />}
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
