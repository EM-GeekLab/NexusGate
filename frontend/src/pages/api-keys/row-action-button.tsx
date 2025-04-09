import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUpDownIcon, CopyIcon, MoreHorizontalIcon, OctagonXIcon } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { newApiError } from '@/lib/error'
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

import { useTranslation } from 'react-i18next'
import { Trans } from 'react-i18next'

export const RowActionButton = ({ data }: { data: ApiKey }) => {
  const { t } = useTranslation()

  const { copy } = useCopy({
    showSuccessToast: true,
    successToastMessage: t('Src_pages_api-keys_row-action-button_APIKeyCopied'),
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
      toast.success(t('Src_pages_api-keys_row-action-button_APIKeyRevoked'))
    },
  })

  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 p-0">
            <span className="sr-only">{t('Src_pages_api-keys_row-action-button_OpenMenu')}</span>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => copy(data.key)}>
            <CopyIcon />
            {t('Src_pages_api-keys_row-action-button_CopyAPIKey')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: '/requests', search: { apiKeyId: data.id } })}>
            <ArrowUpDownIcon />
            {t('Src_pages_api-keys_row-action-button_ViewRequests')}
          </DropdownMenuItem>
          {!data.revoked && (
            <>
              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                <DropdownMenuItem>
                  <OctagonXIcon />
                  {t('Src_pages_api-keys_row-action-button_RevokeAPIKey')}
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Src_pages_api-keys_row-action-button_AreYouSure?')}</AlertDialogTitle>
          <AlertDialogDescription>
          <Trans
            i18nKey="Src_pages_api-keys_row-action-button_APIKeyOfApplicationWillBeRevoked"
            values={{ comment: data.comment }}
            components={{ bold: <span className="text-foreground font-bold" /> }}
          />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Src_pages_api-keys_row-action-button_Cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => mutate(data.key)}>
            {t('Src_pages_api-keys_row-action-button_Continue')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
