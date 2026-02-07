import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2Icon, CircleDashedIcon, PlusIcon, Trash2Icon, XCircleIcon } from 'lucide-react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { api } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { GrafanaConnectionResponse, GrafanaDashboard } from '@/hooks/use-settings'

// ============================================
// Connection Form
// ============================================

const connectionSchema = z.object({
  apiUrl: z.string().url('Must be a valid URL'),
  authToken: z.string().min(1, 'Token is required'),
})

type ConnectionFormValues = z.infer<typeof connectionSchema>

// ============================================
// Dashboard Form
// ============================================

const dashboardEntrySchema = z.object({
  id: z.string().min(1, 'ID is required'),
  label: z.string().min(1, 'Label is required'),
  url: z.string().url('Must be a valid URL'),
})

const dashboardsFormSchema = z.object({
  dashboards: z.array(dashboardEntrySchema),
})

type DashboardsFormValues = z.infer<typeof dashboardsFormSchema>

// ============================================
// Main Page Component
// ============================================

interface GrafanaSettingsPageProps {
  connection: GrafanaConnectionResponse
  dashboards: GrafanaDashboard[]
  envOverride: boolean
}

export function GrafanaSettingsPage({ connection, dashboards, envOverride }: GrafanaSettingsPageProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('pages.settings.grafana.Title')}</h2>
        <p className="text-muted-foreground">{t('pages.settings.grafana.Description')}</p>
      </div>
      <ConnectionCard connection={connection} />
      <DashboardsCard dashboards={dashboards} envOverride={envOverride} />
    </div>
  )
}

// ============================================
// Connection Card
// ============================================

function ConnectionCard({ connection }: { connection: GrafanaConnectionResponse }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isTesting, setIsTesting] = useState(false)

  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      apiUrl: connection.apiUrl ?? '',
      authToken: '',
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: ConnectionFormValues) => {
      const { error } = await api.admin.grafana.connection.put(values)
      if (error) {
        throw new Error(typeof error === 'object' && 'error' in error ? String(error.error) : 'Save failed')
      }
    },
    onSuccess: () => {
      toast.success(t('pages.settings.grafana.ConnectionSaved'))
      queryClient.invalidateQueries({ queryKey: ['grafanaConnection'] })
    },
    onError: () => {
      toast.error(t('pages.settings.grafana.SaveFailed'))
    },
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      setIsTesting(true)
      const { error } = await api.admin.grafana.connection.test.post()
      if (error) {
        throw new Error(typeof error === 'object' && 'error' in error ? String(error.error) : 'Test failed')
      }
    },
    onSuccess: () => {
      toast.success(t('pages.settings.grafana.TestSuccess'))
      queryClient.invalidateQueries({ queryKey: ['grafanaConnection'] })
    },
    onError: (error) => {
      toast.error(t('pages.settings.grafana.TestFailed'), { description: error.message })
    },
    onSettled: () => {
      setIsTesting(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.admin.grafana.connection.delete()
      if (error) {
        throw new Error('Delete failed')
      }
    },
    onSuccess: () => {
      toast.success(t('pages.settings.grafana.Deleted'))
      form.reset({ apiUrl: '', authToken: '' })
      queryClient.invalidateQueries({ queryKey: ['grafanaConnection'] })
    },
    onError: () => {
      toast.error(t('pages.settings.grafana.DeleteFailed'))
    },
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('pages.settings.grafana.Connection')}</CardTitle>
            <CardDescription>{t('pages.settings.grafana.ConnectionDescription')}</CardDescription>
          </div>
          <ConnectionStatusBadge connection={connection} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection.verified && (
          <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
            {connection.datasourceUid && (
              <span>
                {t('pages.settings.grafana.DatasourceUid')}:{' '}
                <code className="text-foreground">{connection.datasourceUid}</code>
              </span>
            )}
            {connection.verifiedAt && (
              <span>
                {t('pages.settings.grafana.VerifiedAt')}:{' '}
                {formatDistanceToNow(new Date(connection.verifiedAt), { addSuffix: true })}
              </span>
            )}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="apiUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.grafana.ApiUrl')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('pages.settings.grafana.ApiUrlPlaceholder')} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.grafana.AuthToken')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={connection.hasToken ? '••••••••' : t('pages.settings.grafana.AuthTokenPlaceholder')}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {t('pages.settings.grafana.Save')}
              </Button>
              {connection.configured && (
                <>
                  <Button type="button" variant="outline" disabled={isTesting} onClick={() => testMutation.mutate()}>
                    {isTesting ? t('pages.settings.grafana.Testing') : t('pages.settings.grafana.TestConnection')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    {t('pages.settings.grafana.Delete')}
                  </Button>
                </>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function ConnectionStatusBadge({ connection }: { connection: GrafanaConnectionResponse }) {
  const { t } = useTranslation()

  if (!connection.configured) {
    return (
      <Badge variant="outline" className="gap-1">
        <CircleDashedIcon className="size-3" />
        {t('pages.settings.grafana.StatusNotConfigured')}
      </Badge>
    )
  }
  if (connection.verified) {
    return (
      <Badge variant="default" className="gap-1 bg-green-600">
        <CheckCircle2Icon className="size-3" />
        {t('pages.settings.grafana.StatusConnected')}
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircleIcon className="size-3" />
      {t('pages.settings.grafana.StatusNotConnected')}
    </Badge>
  )
}

// ============================================
// Dashboards Card
// ============================================

function DashboardsCard({ dashboards, envOverride }: { dashboards: GrafanaDashboard[]; envOverride: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const form = useForm<DashboardsFormValues>({
    resolver: zodResolver(dashboardsFormSchema),
    defaultValues: {
      dashboards: dashboards.length > 0 ? dashboards : [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'dashboards',
  })

  const saveMutation = useMutation({
    mutationFn: async (values: DashboardsFormValues) => {
      const { error } = await api.admin.dashboards.put({ dashboards: values.dashboards })
      if (error) {
        throw new Error(typeof error === 'object' && 'error' in error ? String(error.error) : 'Save failed')
      }
    },
    onSuccess: () => {
      toast.success(t('pages.settings.grafana.DashboardsSaved'))
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
    },
    onError: () => {
      toast.error(t('pages.settings.grafana.DashboardsSaveFailed'))
    },
  })

  const clearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.admin.dashboards.delete()
      if (error) {
        throw new Error('Clear failed')
      }
    },
    onSuccess: () => {
      toast.success(t('pages.settings.grafana.DashboardsCleared'))
      form.reset({ dashboards: [] })
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
    },
    onError: () => {
      toast.error(t('pages.settings.grafana.DashboardsClearFailed'))
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.settings.grafana.Dashboards')}</CardTitle>
        <CardDescription>{t('pages.settings.grafana.DashboardsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {envOverride && (
          <Alert>
            <AlertDescription>{t('pages.settings.grafana.EnvOverrideWarning')}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            {fields.length === 0 && (
              <p className="text-muted-foreground text-sm">{t('pages.settings.grafana.NoDashboards')}</p>
            )}

            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-2">
                <FormField
                  control={form.control}
                  name={`dashboards.${index}.id`}
                  render={({ field: f }) => (
                    <FormItem className="flex-1">
                      {index === 0 && <FormLabel>{t('pages.settings.grafana.DashboardId')}</FormLabel>}
                      <FormControl>
                        <Input
                          placeholder={t('pages.settings.grafana.DashboardIdPlaceholder')}
                          disabled={envOverride}
                          {...f}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`dashboards.${index}.label`}
                  render={({ field: f }) => (
                    <FormItem className="flex-1">
                      {index === 0 && <FormLabel>{t('pages.settings.grafana.DashboardLabel')}</FormLabel>}
                      <FormControl>
                        <Input
                          placeholder={t('pages.settings.grafana.DashboardLabelPlaceholder')}
                          disabled={envOverride}
                          {...f}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`dashboards.${index}.url`}
                  render={({ field: f }) => (
                    <FormItem className="flex-[2]">
                      {index === 0 && <FormLabel>{t('pages.settings.grafana.DashboardUrl')}</FormLabel>}
                      <FormControl>
                        <Input
                          placeholder={t('pages.settings.grafana.DashboardUrlPlaceholder')}
                          disabled={envOverride}
                          {...f}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {!envOverride && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
              </div>
            ))}

            {!envOverride && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ id: '', label: '', url: '' })}
                >
                  <PlusIcon className="mr-1 size-4" />
                  {t('pages.settings.grafana.AddDashboard')}
                </Button>
                <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                  {t('pages.settings.grafana.SaveDashboards')}
                </Button>
                {fields.length > 0 && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={clearMutation.isPending}
                    onClick={() => clearMutation.mutate()}
                  >
                    {t('pages.settings.grafana.ClearDashboards')}
                  </Button>
                )}
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
