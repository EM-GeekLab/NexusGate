import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontalIcon, PencilIcon, TrashIcon, ZapIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { Provider } from './providers-columns'
import { ProviderEditDialog } from './provider-edit-dialog'

import { useTranslation } from 'react-i18next'

export function ProviderRowActionButton({ provider }: { provider: Provider }) {
  const { t } = useTranslation()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const queryClient = useQueryClient()

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.admin.providers({ id: provider.id }).test.post()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(t('pages.settings.providers.TestSuccess'), {
          description: t('pages.settings.providers.ModelsFound', { count: data.models?.length ?? 0 }),
        })
      }
    },
    onError: () => {
      toast.error(t('pages.settings.providers.TestFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.admin.providers({ id: provider.id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      toast.success(t('pages.settings.providers.ProviderDeleted'))
    },
    onError: () => {
      toast.error(t('pages.settings.providers.DeleteFailed'))
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">{t('pages.settings.providers.OpenMenu')}</span>
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => testMutation.mutate()}>
            <ZapIcon className="mr-2 h-4 w-4" />
            {t('pages.settings.providers.TestConnection')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            <PencilIcon className="mr-2 h-4 w-4" />
            {t('pages.settings.providers.Edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            {t('pages.settings.providers.Delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pages.settings.providers.DeleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pages.settings.providers.DeleteDescription', { name: provider.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pages.settings.providers.Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {t('pages.settings.providers.Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProviderEditDialog
        provider={provider}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
    </>
  )
}
