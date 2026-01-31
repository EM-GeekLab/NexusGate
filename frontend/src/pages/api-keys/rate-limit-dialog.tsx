import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
} from '@/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

import type { ApiKey } from './columns'

const rateLimitSchema = z.object({
  rpmLimit: z.number().min(1).max(10000),
  tpmLimit: z.number().min(1).max(10000000),
})

type RateLimitFormValues = z.infer<typeof rateLimitSchema>

interface RateLimitDialogProps {
  apiKey: ApiKey
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RateLimitDialog({ apiKey, open, onOpenChange }: RateLimitDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Fetch current usage
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['apiKeyUsage', apiKey.key],
    queryFn: async () => {
      const { data, error } = await api.admin.apiKey({ key: apiKey.key }).usage.get()
      if (error) throw error
      return data
    },
    enabled: open,
    refetchInterval: open ? 5000 : false, // Refresh every 5s when dialog is open
  })

  const form = useForm<RateLimitFormValues>({
    resolver: zodResolver(rateLimitSchema),
    defaultValues: {
      rpmLimit: apiKey.rpmLimit,
      tpmLimit: apiKey.tpmLimit,
    },
  })

  // Reset form when dialog opens with new apiKey data
  useEffect(() => {
    if (open) {
      form.reset({
        rpmLimit: apiKey.rpmLimit,
        tpmLimit: apiKey.tpmLimit,
      })
    }
  }, [open, apiKey.rpmLimit, apiKey.tpmLimit, form])

  const mutation = useMutation({
    mutationFn: async (values: RateLimitFormValues) => {
      const { data, error } = await api.admin.apiKey({ key: apiKey.key }).ratelimit.put(values)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      toast.success(t('pages.api-keys.rate-limit.UpdateSuccess'))
      onOpenChange(false)
    },
    onError: () => {
      toast.error(t('pages.api-keys.rate-limit.UpdateFailed'))
    },
  })

  const onSubmit = (values: RateLimitFormValues) => {
    mutation.mutate(values)
  }

  // Calculate usage percentage safely
  const getRpmPercentage = () => {
    if (!usage?.usage?.rpm) return 0
    const limit = usage.limits.rpm
    if (limit <= 0) return 0
    return Math.min(100, (usage.usage.rpm.current / limit) * 100)
  }

  const getTpmPercentage = () => {
    if (!usage?.usage?.tpm) return 0
    const limit = usage.limits.tpm
    if (limit <= 0) return 0
    return Math.min(100, (usage.usage.tpm.current / limit) * 100)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('pages.api-keys.rate-limit.ConfigureRateLimits')}</DialogTitle>
          <DialogDescription>
            {t('pages.api-keys.rate-limit.ConfigureRateLimitsDescription', { name: apiKey.comment || apiKey.key })}
          </DialogDescription>
        </DialogHeader>

        {/* Current Usage Section */}
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="font-medium">{t('pages.api-keys.rate-limit.CurrentUsage')}</h4>
          {usageLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : usage ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{t('pages.api-keys.rate-limit.RPM')}</span>
                  <span>
                    {usage.usage.rpm.current} / {usage.limits.rpm}
                  </span>
                </div>
                <Progress value={getRpmPercentage()} className="h-2" />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{t('pages.api-keys.rate-limit.TPM')}</span>
                  <span>
                    {usage.usage.tpm.current.toLocaleString()} / {usage.limits.tpm.toLocaleString()}
                  </span>
                </div>
                <Progress value={getTpmPercentage()} className="h-2" />
              </div>
            </div>
          ) : null}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="rpmLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.api-keys.rate-limit.RPMLimit')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormDescription>{t('pages.api-keys.rate-limit.RPMLimitDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tpmLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.api-keys.rate-limit.TPMLimit')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={10000000}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormDescription>{t('pages.api-keys.rate-limit.TPMLimitDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('pages.api-keys.rate-limit.Cancel')}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {t('pages.api-keys.rate-limit.Save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
