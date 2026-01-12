import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useLocalStorage } from 'usehooks-ts'

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
import { Input } from '@/components/ui/input'

export function AuthDialog() {
  const [secret, setSecret] = useLocalStorage('admin-secret', '')
  const { t } = useTranslation()

  const queryClient = useQueryClient()
  const router = useRouter()
  const { data: checkPassed = true } = useQuery({
    queryKey: ['check-secret', secret],
    queryFn: async () => {
      const { data, error } = await api.admin.get()
      if (error || !data) {
        toast.error(t('components.app.auth-dialog.InvalidSecret'))
        return false
      }
      await queryClient.invalidateQueries({
        predicate(query) {
          return !['check-secret', 'github-head'].includes(query.queryKey[0] as string)
        },
      })
      await router.invalidate()
      return true
    },
    enabled: !!secret,
  })

  const showDialog = !checkPassed || !secret

  return (
    <Dialog open={showDialog}>
      <DialogContent withClose={false}>
        <DialogHeader>
          <DialogTitle>{t('components.app.auth-dialog.AuthenticationRequired')}</DialogTitle>
          <DialogDescription>{t('components.app.auth-dialog.AdminSecret')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setSecret((e.currentTarget.querySelector('input') as HTMLInputElement).value)
          }}
        >
          <Input type="password" />
          <DialogFooter>
            <Button type="submit">{t('components.app.auth-dialog.Save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
