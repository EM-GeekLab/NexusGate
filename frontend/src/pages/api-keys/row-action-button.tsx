import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUpDownIcon, CopyIcon, GaugeIcon, MoreHorizontalIcon, OctagonXIcon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { newApiError } from '@/lib/error'
import { getAPIBaseURL } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCopy } from '@/hooks/use-copy'

import type { ApiKey } from './columns'
import { RateLimitDialog } from './rate-limit-dialog'

export const RowActionButton = ({ data }: { data: ApiKey }) => {
  const [rateLimitDialogOpen, setRateLimitDialogOpen] = useState(false)
  const { t } = useTranslation()

  const { copy } = useCopy({
    showSuccessToast: true,
    successToastMessage: t('pages.api-keys.row-action-button.APIKeyCopied'),
  })
  const navigate = useNavigate()

  const queryClient = useQueryClient()
  const { mutate } = useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await api.admin.apiKey({ key }).delete()
      if (error) throw newApiError(error)
      return data
    },
    onMutate: async (key) => {
      await queryClient.cancelQueries({ queryKey: ['apiKeys'] })
      const prevAllItems = (queryClient.getQueryData(['apiKeys', { includeRevoked: true }]) || []) as ApiKey[]
      const prevItems = (queryClient.getQueryData(['apiKeys', { includeRevoked: false }]) || []) as ApiKey[]
      queryClient.setQueryData(
        ['apiKeys', { includeRevoked: true }],
        prevAllItems.map((item) => {
          if (item.key !== key) return item
          return { ...item, revoked: true }
        }),
      )
      queryClient.setQueryData(
        ['apiKeys', { includeRevoked: false }],
        prevItems.filter((item) => item.key !== key),
      )
      return { prevAllItems, prevItems }
    },
    onError: (error, _, context) => {
      toast.error(error.message)
      if (context) {
        queryClient.setQueryData(['apiKeys', { includeRevoked: true }], context.prevAllItems)
        queryClient.setQueryData(['apiKeys', { includeRevoked: false }], context.prevItems)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
    },
    onSuccess: () => {
      toast.success(t('pages.api-keys.row-action-button.APIKeyRevoked'))
    },
  })

  return (
    <>
      <AlertDialog>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="size-8 p-0">
              <span className="sr-only">{t('pages.api-keys.row-action-button.OpenMenu')}</span>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => copy(getAPIBaseURL())}>
              <CopyIcon />
              {t('pages.api-keys.row-action-button.CopyBaseURL')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copy(data.key)}>
              <CopyIcon />
              {t('pages.api-keys.row-action-button.CopyAPIKey')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: '/requests', search: { apiKeyId: data.id } })}>
              <ArrowUpDownIcon />
              {t('pages.api-keys.row-action-button.ViewRequests')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRateLimitDialogOpen(true)}>
              <GaugeIcon />
              {t('pages.api-keys.row-action-button.ConfigureRateLimits')}
            </DropdownMenuItem>
            {!data.revoked && (
              <>
                <DropdownMenuSeparator />
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem>
                    <OctagonXIcon />
                    {t('pages.api-keys.row-action-button.RevokeAPIKey')}
                  </DropdownMenuItem>
                </AlertDialogTrigger>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pages.api-keys.row-action-button.AreYouSure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="pages.api-keys.row-action-button.APIKeyOfApplicationWillBeRevoked"
                values={{ comment: data.comment }}
                components={{ bold: <span className="text-foreground font-bold" /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pages.api-keys.row-action-button.Cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => mutate(data.key)}>
              {t('pages.api-keys.row-action-button.Continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RateLimitDialog apiKey={data} open={rateLimitDialogOpen} onOpenChange={setRateLimitDialogOpen} />
    </>
  )
}
