import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontalIcon, PencilIcon, TrashIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

import { ModelEditDialog } from './model-edit-dialog'
import type { Model } from './models-columns'

export function ModelRowActionButton({ model }: { model: Model }) {
  const { t } = useTranslation()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.admin.models({ id: model.id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      queryClient.invalidateQueries({ queryKey: ['provider-models', model.providerId] })
      toast.success(t('pages.settings.models.ModelDeleted'))
    },
    onError: () => {
      toast.error(t('pages.settings.models.DeleteFailed'))
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">{t('pages.settings.models.OpenMenu')}</span>
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            <PencilIcon className="mr-2 h-4 w-4" />
            {t('pages.settings.models.Edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            {t('pages.settings.models.Delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pages.settings.models.DeleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pages.settings.models.DeleteDescription', { name: model.systemName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pages.settings.models.Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {t('pages.settings.models.Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ModelEditDialog model={model} open={showEditDialog} onOpenChange={setShowEditDialog} />
    </>
  )
}
