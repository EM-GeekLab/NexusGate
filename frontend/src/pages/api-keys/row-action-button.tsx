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
    successToastMessage: t('API.key.copied.to.clipboard.'),
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
      toast.success(t('API.key.revoked.'))
    },
  })

  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 p-0">
            <span className="sr-only">{t('Open.menu')}</span>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => copy(data.key)}>
            <CopyIcon />
            {t('Copy.API.Key')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: '/requests', search: { apiKeyId: data.id } })}>
            <ArrowUpDownIcon />
            {t('View.requests')}
          </DropdownMenuItem>
          {!data.revoked && (
            <>
              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                <DropdownMenuItem>
                  <OctagonXIcon />
                  {t('Revoke.API.Key')}
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Are.you.sure?')}</AlertDialogTitle>
          <AlertDialogDescription>
          <Trans
            i18nKey="The.API.key.of.application.<bold>{{comment}}</bold>.will.be.revoked."
            values={{ comment: data.comment }}
            components={{ bold: <span className="text-foreground font-bold" /> }}
          />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => mutate(data.key)}>
            {t('Continue')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
