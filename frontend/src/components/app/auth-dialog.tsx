import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
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
import { useTranslation } from 'react-i18next'

export function AuthDialog() {
  const [secret, setSecret] = useLocalStorage('admin-secret', '')
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const router = useRouter()
  const hasRefreshed = useRef(false)

  const { data: queryResult } = useQuery({
    queryKey: ['check-secret', secret],
    queryFn: async () => {
      const { data, error } = await api.admin.index.get()
      if (error) {
        toast.error(t('components.app.auth-dialog.InvalidSecret'))
        return false
      }
      return data
    },
    enabled: !!secret,
  })

  // checkPassed is true only when query succeeded with valid secret
  const checkPassed = !!secret && queryResult === true

  // When authentication succeeds, invalidate authenticated queries and refresh router
  useEffect(() => {
    if (checkPassed && !hasRefreshed.current) {
      hasRefreshed.current = true
      // Only invalidate queries that require authentication
      // Exclude: 'check-secret' (auth itself), 'github-head' (public API)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0]
          return typeof key === 'string' && !['check-secret', 'github-head'].includes(key)
        },
      })
      router.invalidate()
    }
  }, [checkPassed, queryClient, router])

  const showDialog = !checkPassed

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
          <Input type="password" placeholder={t('components.app.auth-dialog.Placeholder')} />
          <DialogFooter>
            <Button type="submit">{t('components.app.auth-dialog.Save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
