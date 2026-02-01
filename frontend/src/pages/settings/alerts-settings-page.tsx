import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  BellIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  InfoIcon,
  Loader2Icon,
  MailIcon,
  MessageSquareIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  TrashIcon,
  WebhookIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { api } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { grafanaSyncStatusQueryOptions } from '@/hooks/use-settings'

// ============================================
// Types
// ============================================

interface AlertChannel {
  id: number
  name: string
  type: 'webhook' | 'email' | 'feishu'
  config: Record<string, unknown>
  enabled: boolean
  createdAt: string
}

interface AlertRule {
  id: number
  name: string
  type: 'budget' | 'error_rate' | 'latency' | 'quota'
  condition: Record<string, unknown>
  channelIds: number[]
  cooldownMinutes: number
  enabled: boolean
  createdAt: string
}

interface AlertHistoryItem {
  id: number
  ruleId: number
  triggeredAt: string
  payload: {
    ruleType: string
    ruleName: string
    message: string
    currentValue: number
    threshold: number
  }
  status: 'sent' | 'failed' | 'suppressed'
}

interface SyncStatusItem {
  id: number
  name: string
  enabled: boolean
  grafanaUid: string | null
  grafanaSyncedAt: string | null
  grafanaSyncError: string | null
}

interface AlertsSettingsPageProps {
  channels: AlertChannel[]
  rules: AlertRule[]
  history: { data: AlertHistoryItem[]; total: number; from: number }
  grafanaConnected: boolean
  grafanaApiUrl: string | null
}

// ============================================
// Channel Form
// ============================================

const CHANNEL_TYPES = ['webhook', 'email', 'feishu'] as const

const channelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(CHANNEL_TYPES),
  // Webhook fields
  webhookUrl: z.string().optional(),
  webhookSecret: z.string().optional(),
  // Email fields
  emailHost: z.string().optional(),
  emailPort: z.coerce.number().optional(),
  emailUser: z.string().optional(),
  emailPassword: z.string().optional(),
  emailFrom: z.string().optional(),
  emailTo: z.string().optional(),
  // Feishu fields
  feishuWebhookUrl: z.string().optional(),
  feishuSecret: z.string().optional(),
})

type ChannelFormValues = z.infer<typeof channelSchema>

function buildChannelConfig(values: ChannelFormValues): Record<string, unknown> {
  switch (values.type) {
    case 'webhook':
      return {
        url: values.webhookUrl || '',
        secret: values.webhookSecret || undefined,
      }
    case 'email':
      return {
        host: values.emailHost || '',
        port: values.emailPort || 587,
        user: values.emailUser || '',
        password: values.emailPassword || '',
        from: values.emailFrom || '',
        to: values.emailTo?.split(',').map((s) => s.trim()) || [],
      }
    case 'feishu':
      return {
        webhookUrl: values.feishuWebhookUrl || '',
        secret: values.feishuSecret || undefined,
      }
  }
}

// ============================================
// Rule Form
// ============================================

const RULE_TYPES = ['budget', 'error_rate', 'latency', 'quota'] as const

const RULE_TYPE_LABELS: Record<string, string> = {
  budget: 'Budget',
  error_rate: 'Error Rate',
  latency: 'Latency',
  quota: 'Quota',
}

const ruleSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(RULE_TYPES),
  channelIds: z.string().min(1),
  cooldownMinutes: z.coerce.number().min(1).default(60),
  // Budget
  thresholdUsd: z.coerce.number().optional(),
  periodDays: z.coerce.number().optional(),
  // Error rate
  errorThresholdPercent: z.coerce.number().optional(),
  errorWindowMinutes: z.coerce.number().optional(),
  // Latency
  latencyThresholdMs: z.coerce.number().optional(),
  latencyPercentile: z.coerce.number().optional(),
  latencyWindowMinutes: z.coerce.number().optional(),
  // Quota
  quotaThresholdPercent: z.coerce.number().optional(),
  quotaLimitType: z.string().optional(),
})

type RuleFormValues = z.infer<typeof ruleSchema>

function buildRuleCondition(values: RuleFormValues): Record<string, unknown> {
  switch (values.type) {
    case 'budget':
      return {
        thresholdUsd: values.thresholdUsd || 0,
        periodDays: values.periodDays || 30,
      }
    case 'error_rate':
      return {
        thresholdPercent: values.errorThresholdPercent || 0,
        windowMinutes: values.errorWindowMinutes || 5,
      }
    case 'latency':
      return {
        thresholdMs: values.latencyThresholdMs || 0,
        percentile: values.latencyPercentile || 95,
        windowMinutes: values.latencyWindowMinutes || 5,
      }
    case 'quota':
      return {
        thresholdPercent: values.quotaThresholdPercent || 0,
        limitType: values.quotaLimitType || 'both',
      }
  }
}

// ============================================
// Sync Badge Component
// ============================================

function SyncBadge({ syncStatus }: { syncStatus?: SyncStatusItem }) {
  const { t } = useTranslation()

  if (!syncStatus) {
    return (
      <Badge variant="secondary">
        <XCircleIcon className="mr-1 size-3" />
        {t('pages.settings.alerts.grafana.NotSynced')}
      </Badge>
    )
  }

  if (syncStatus.grafanaSyncError) {
    return (
      <Badge variant="destructive" title={syncStatus.grafanaSyncError}>
        <XCircleIcon className="mr-1 size-3" />
        {t('pages.settings.alerts.grafana.SyncFailed')}
      </Badge>
    )
  }

  if (syncStatus.grafanaSyncedAt) {
    return (
      <Badge variant="default" className="bg-green-600">
        <CheckCircleIcon className="mr-1 size-3" />
        {t('pages.settings.alerts.grafana.Synced')}
      </Badge>
    )
  }

  return (
    <Badge variant="secondary">
      <XCircleIcon className="mr-1 size-3" />
      {t('pages.settings.alerts.grafana.NotSynced')}
    </Badge>
  )
}

// ============================================
// Main Page Component
// ============================================

export function AlertsSettingsPage({ channels, rules, history, grafanaConnected, grafanaApiUrl }: AlertsSettingsPageProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      {grafanaConnected && (
        <Alert>
          <InfoIcon className="size-4" />
          <AlertDescription>
            {t('pages.settings.alerts.grafana.HistoryBanner')}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="channels">
        <TabsList>
          <TabsTrigger value="channels">{t('pages.settings.alerts.Channels')}</TabsTrigger>
          <TabsTrigger value="rules">{t('pages.settings.alerts.Rules')}</TabsTrigger>
          <TabsTrigger value="history">{t('pages.settings.alerts.History')}</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="mt-4">
          <ChannelsTab channels={channels} grafanaConnected={grafanaConnected} />
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <RulesTab rules={rules} channels={channels} grafanaConnected={grafanaConnected} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab history={history} rules={rules} grafanaConnected={grafanaConnected} grafanaApiUrl={grafanaApiUrl} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================
// Channels Tab
// ============================================

function ChannelsTab({ channels, grafanaConnected }: { channels: AlertChannel[]; grafanaConnected: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: syncStatus } = useQuery({
    ...grafanaSyncStatusQueryOptions(),
    enabled: grafanaConnected,
  })

  const form = useForm<ChannelFormValues>({
    resolver: zodResolver(channelSchema),
    defaultValues: {
      name: '',
      type: 'webhook',
      webhookUrl: '',
      webhookSecret: '',
      emailHost: '',
      emailPort: 587,
      emailUser: '',
      emailPassword: '',
      emailFrom: '',
      emailTo: '',
      feishuWebhookUrl: '',
      feishuSecret: '',
    },
  })

  const watchType = form.watch('type')

  const createMutation = useMutation({
    mutationFn: async (values: ChannelFormValues) => {
      const config = buildChannelConfig(values)
      const { data, error } = await api.admin.alerts.channels.post({
        name: values.name,
        type: values.type,
        config,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertChannels'] })
      toast.success(t('pages.settings.alerts.ChannelCreated'))
      form.reset()
    },
    onError: () => {
      toast.error(t('pages.settings.alerts.CreateChannelFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.admin.alerts.channels({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertChannels'] })
      toast.success(t('pages.settings.alerts.ChannelDeleted'))
    },
    onError: () => {
      toast.error(t('pages.settings.alerts.DeleteChannelFailed'))
    },
  })

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await api.admin.alerts.channels({ id }).test.post()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success(t('pages.settings.alerts.TestSent'))
    },
    onError: () => {
      toast.error(t('pages.settings.alerts.TestFailed'))
    },
  })

  const syncChannelsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.admin.grafana.sync.channels.post()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grafanaSyncStatus'] })
      toast.success(t('pages.settings.alerts.grafana.SyncSuccess'))
    },
    onError: () => {
      toast.error(t('pages.settings.alerts.grafana.SyncError'))
    },
  })

  const onSubmit = (values: ChannelFormValues) => {
    createMutation.mutate(values)
  }

  const channelTypeIcon = (type: string) => {
    switch (type) {
      case 'webhook':
        return <WebhookIcon className="size-5" />
      case 'email':
        return <MailIcon className="size-5" />
      case 'feishu':
        return <MessageSquareIcon className="size-5" />
      default:
        return <BellIcon className="size-5" />
    }
  }

  const getChannelSyncStatus = (id: number): SyncStatusItem | undefined => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (syncStatus as any)?.channels?.find((c: SyncStatusItem) => c.id === id)
  }

  return (
    <div className="space-y-8">
      {grafanaConnected && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => syncChannelsMutation.mutate()}
            disabled={syncChannelsMutation.isPending}
          >
            {syncChannelsMutation.isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="mr-2 size-4" />
            )}
            {syncChannelsMutation.isPending
              ? t('pages.settings.alerts.grafana.Syncing')
              : t('pages.settings.alerts.grafana.SyncChannels')}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 flex size-10 items-center justify-center rounded-lg">
              <PlusIcon className="text-primary size-5" />
            </div>
            <h3 className="text-lg font-semibold">{t('pages.settings.alerts.AddChannel')}</h3>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pages.settings.alerts.ChannelName')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('pages.settings.alerts.ChannelNamePlaceholder')} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pages.settings.alerts.ChannelType')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="webhook">Webhook</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="feishu">Feishu</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              {watchType === 'webhook' && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="webhookUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Webhook URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com/webhook" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="webhookSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.Secret')}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder={t('pages.settings.alerts.SecretPlaceholder')} {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {watchType === 'email' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emailHost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP Host</FormLabel>
                          <FormControl>
                            <Input placeholder="smtp.example.com" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emailPort"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP Port</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="587" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emailUser"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('pages.settings.alerts.EmailUser')}</FormLabel>
                          <FormControl>
                            <Input placeholder="user@example.com" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emailPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('pages.settings.alerts.EmailPassword')}</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="emailFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.EmailFrom')}</FormLabel>
                        <FormControl>
                          <Input placeholder="alerts@example.com" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emailTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.EmailTo')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('pages.settings.alerts.EmailToPlaceholder')} {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {watchType === 'feishu' && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="feishuWebhookUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Feishu Webhook URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="feishuSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.Secret')}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder={t('pages.settings.alerts.SecretPlaceholder')} {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {t('pages.settings.alerts.Save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-muted-foreground mb-5 text-sm font-medium">
          {t('pages.settings.alerts.ConfiguredChannels')}
        </h3>
        <div className="space-y-4">
          {channels.map((channel) => (
            <Card key={channel.id}>
              <CardContent className="flex items-center justify-between gap-4 px-6 py-5">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-lg">
                    <span className="text-muted-foreground">{channelTypeIcon(channel.type)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="truncate text-base font-medium">{channel.name}</span>
                      <Badge variant={channel.enabled ? 'default' : 'secondary'}>
                        {channel.type}
                      </Badge>
                      {grafanaConnected && <SyncBadge syncStatus={getChannelSyncStatus(channel.id)} />}
                    </div>
                    <div className="text-muted-foreground mt-1 truncate text-sm">
                      {t('pages.settings.alerts.CreatedAt')}{' '}
                      {formatDistanceToNow(new Date(channel.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate(channel.id)}
                    disabled={testMutation.isPending}
                  >
                    <SendIcon className="mr-2 size-4" />
                    {t('pages.settings.alerts.Test')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(channel.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {channels.length === 0 && (
            <div className="text-muted-foreground py-12 text-center text-sm">
              {t('pages.settings.alerts.NoChannels')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Rules Tab
// ============================================

function RulesTab({
  rules,
  channels,
  grafanaConnected,
}: {
  rules: AlertRule[]
  channels: AlertChannel[]
  grafanaConnected: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: syncStatus } = useQuery({
    ...grafanaSyncStatusQueryOptions(),
    enabled: grafanaConnected,
  })

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: '',
      type: 'error_rate',
      channelIds: '',
      cooldownMinutes: 60,
      thresholdUsd: 100,
      periodDays: 30,
      errorThresholdPercent: 10,
      errorWindowMinutes: 5,
      latencyThresholdMs: 5000,
      latencyPercentile: 95,
      latencyWindowMinutes: 5,
      quotaThresholdPercent: 80,
      quotaLimitType: 'both',
    },
  })

  const watchType = form.watch('type')

  const createMutation = useMutation({
    mutationFn: async (values: RuleFormValues) => {
      const condition = buildRuleCondition(values)
      const channelIds = values.channelIds.split(',').map((s) => Number(s.trim())).filter(Boolean)
      const { data, error } = await api.admin.alerts.rules.post({
        name: values.name,
        type: values.type,
        condition,
        channelIds,
        cooldownMinutes: values.cooldownMinutes,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] })
      toast.success(t('pages.settings.alerts.RuleCreated'))
      form.reset()
    },
    onError: () => {
      toast.error(t('pages.settings.alerts.CreateRuleFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.admin.alerts.rules({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] })
      toast.success(t('pages.settings.alerts.RuleDeleted'))
    },
    onError: () => {
      toast.error(t('pages.settings.alerts.DeleteRuleFailed'))
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const { error } = await api.admin.alerts.rules({ id }).put({ enabled })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] })
    },
  })

  const syncRulesMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.admin.grafana.sync.rules.post()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grafanaSyncStatus'] })
      toast.success(t('pages.settings.alerts.grafana.SyncSuccess'))
    },
    onError: () => {
      toast.error(t('pages.settings.alerts.grafana.SyncError'))
    },
  })

  const onSubmit = (values: RuleFormValues) => {
    createMutation.mutate(values)
  }

  const getChannelName = (id: number) => {
    return channels.find((c) => c.id === id)?.name ?? `#${id}`
  }

  const getRuleSyncStatus = (id: number): SyncStatusItem | undefined => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (syncStatus as any)?.rules?.find((r: SyncStatusItem) => r.id === id)
  }

  return (
    <div className="space-y-8">
      {grafanaConnected && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => syncRulesMutation.mutate()}
            disabled={syncRulesMutation.isPending}
          >
            {syncRulesMutation.isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="mr-2 size-4" />
            )}
            {syncRulesMutation.isPending
              ? t('pages.settings.alerts.grafana.Syncing')
              : t('pages.settings.alerts.grafana.SyncRules')}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 flex size-10 items-center justify-center rounded-lg">
              <PlusIcon className="text-primary size-5" />
            </div>
            <h3 className="text-lg font-semibold">{t('pages.settings.alerts.AddRule')}</h3>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pages.settings.alerts.RuleName')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('pages.settings.alerts.RuleNamePlaceholder')} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pages.settings.alerts.RuleType')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RULE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {RULE_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              {watchType === 'budget' && (
                <div className="grid grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="thresholdUsd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.BudgetThreshold')}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="100" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="periodDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.PeriodDays')}</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="30" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {watchType === 'error_rate' && (
                <div className="grid grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="errorThresholdPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.ErrorThreshold')}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="10" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="errorWindowMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.WindowMinutes')}</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="5" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {watchType === 'latency' && (
                <div className="grid grid-cols-3 gap-5">
                  <FormField
                    control={form.control}
                    name="latencyThresholdMs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.LatencyThreshold')}</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="5000" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="latencyPercentile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.Percentile')}</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="95" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="latencyWindowMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.WindowMinutes')}</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="5" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {watchType === 'quota' && (
                <div className="grid grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="quotaThresholdPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.QuotaThreshold')}</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="80" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quotaLimitType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('pages.settings.alerts.LimitType')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || 'both'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="rpm">RPM</SelectItem>
                            <SelectItem value="tpm">TPM</SelectItem>
                            <SelectItem value="both">Both</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="channelIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pages.settings.alerts.NotifyChannels')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('pages.settings.alerts.SelectChannel')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {channels.map((ch) => (
                            <SelectItem key={ch.id} value={String(ch.id)}>
                              {ch.name} ({ch.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cooldownMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pages.settings.alerts.Cooldown')}</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="60" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {t('pages.settings.alerts.Save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-muted-foreground mb-5 text-sm font-medium">
          {t('pages.settings.alerts.ConfiguredRules')}
        </h3>
        <div className="space-y-4">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex items-center justify-between gap-4 px-6 py-5">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-lg">
                    <BellIcon className="text-muted-foreground size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="truncate text-base font-medium">{rule.name}</span>
                      <Badge variant="outline">{RULE_TYPE_LABELS[rule.type] ?? rule.type}</Badge>
                      <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                        {rule.enabled ? t('pages.settings.alerts.Enabled') : t('pages.settings.alerts.Disabled')}
                      </Badge>
                      {grafanaConnected && <SyncBadge syncStatus={getRuleSyncStatus(rule.id)} />}
                    </div>
                    <div className="text-muted-foreground mt-1 text-sm">
                      {t('pages.settings.alerts.CooldownLabel', { minutes: rule.cooldownMinutes })}
                      <span className="mx-2">·</span>
                      {t('pages.settings.alerts.ChannelsLabel')}: {rule.channelIds.map(getChannelName).join(', ')}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                  >
                    {rule.enabled ? t('pages.settings.alerts.Disable') : t('pages.settings.alerts.Enable')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(rule.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {rules.length === 0 && (
            <div className="text-muted-foreground py-12 text-center text-sm">
              {t('pages.settings.alerts.NoRules')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// History Tab
// ============================================

function HistoryTab({
  history,
  rules,
  grafanaConnected,
  grafanaApiUrl,
}: {
  history: { data: AlertHistoryItem[]; total: number; from: number }
  rules: AlertRule[]
  grafanaConnected: boolean
  grafanaApiUrl: string | null
}) {
  const { t } = useTranslation()

  const getRuleName = (ruleId: number) => {
    return rules.find((r) => r.id === ruleId)?.name ?? `Rule #${ruleId}`
  }

  const statusBadgeVariant = (status: string): 'default' | 'destructive' | 'secondary' => {
    switch (status) {
      case 'sent':
        return 'default'
      case 'failed':
        return 'destructive'
      case 'suppressed':
        return 'secondary'
      default:
        return 'secondary'
    }
  }

  return (
    <div className="space-y-4">
      {grafanaConnected && grafanaApiUrl && (
        <Alert>
          <InfoIcon className="size-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{t('pages.settings.alerts.grafana.HistoryBanner')}</span>
            <Button variant="outline" size="sm" asChild>
              <a href={`${grafanaApiUrl}/alerting/list`} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="mr-2 size-4" />
                {t('pages.settings.alerts.grafana.OpenGrafana')}
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <h3 className="text-muted-foreground text-sm font-medium">
        {t('pages.settings.alerts.AlertHistory')} ({history.total})
      </h3>
      {history.data.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center text-sm">
          {t('pages.settings.alerts.NoHistory')}
        </div>
      ) : (
        <div className="space-y-3">
          {history.data.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{item.payload.ruleName || getRuleName(item.ruleId)}</span>
                    <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
                    <Badge variant="outline">{item.payload.ruleType}</Badge>
                  </div>
                  <div className="text-muted-foreground mt-1 text-sm">{item.payload.message}</div>
                </div>
                <div className="text-muted-foreground shrink-0 text-xs">
                  {formatDistanceToNow(new Date(item.triggeredAt), { addSuffix: true })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
