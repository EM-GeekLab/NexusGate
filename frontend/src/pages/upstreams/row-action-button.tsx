import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUpDownIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
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

import type { Upstream } from './columns'

export function RowActionButton({ data }: { data: Upstream }) {
  const { t } = useTranslation()

  const navigate = useNavigate()

  const queryClient = useQueryClient()
  const { mutate } = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await api.admin.upstream({ id }).delete()
      if (error) throw newApiError(error)
      return data
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['upstreams'] })
      const prevItems = (queryClient.getQueryData(['upstreams']) || []) as Upstream[]
      queryClient.setQueryData(
        ['upstreams'],
        prevItems.filter((item) => item.id !== id),
      )
      return { prevItems }
    },
    onError: (error, _, context) => {
      toast.error(error.message)
      if (context) queryClient.setQueryData(['upstreams'], context.prevItems)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['upstreams'] })
    },
    onSuccess: (data) => {
      toast.success(`Provider ${data.name} deleted.`)
    },
  })

  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 p-0">
            <span className="sr-only">{t('Src_pages_upstreams_row-action-button_OpenMenu')}</span>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => navigate({ to: '/requests', search: { upstreamId: data.id } })}>
            <ArrowUpDownIcon />
            {t('Src_pages_upstreams_row-action-button_ViewRequests')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialogTrigger asChild>
            <DropdownMenuItem>
              <Trash2Icon />
              {t('Src_pages_upstreams_row-action-button_Delete')}
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Src_pages_upstreams_row-action-button_AreYouSure?')}</AlertDialogTitle>
          <AlertDialogDescription>
            <Trans
              i18nKey="Src_pages_upstreams_row-action-button_ProviderWillBeDeleted"
              values={{ name: data.name }}
              components={{ bold: <span className="text-foreground font-bold" /> }}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Src_pages_upstreams_row-action-button_Cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => mutate(data.id)}>
            {t('Src_pages_upstreams_row-action-button_Continue')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
