import type { ComponentProps } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { match } from 'ts-pattern'

import type { api } from '@/lib/api'
import { cn, formatNumber } from '@/lib/utils'
import { IndicatorBadge, MiniIndicatorBadge } from '@/components/ui/indicator-badge'
import i18n from '@/i18n'

export type EmbeddingRequest = Exclude<
  Awaited<ReturnType<typeof api.admin.embeddings.get>>['data'],
  null
>['data'][number]

export const columns: ColumnDef<EmbeddingRequest>[] = [
  {
    accessorKey: 'createdAt',
    header: () => <div className="pl-4">{i18n.t('pages.embeddings.columns.CreatedAt')}</div>,
    cell: ({ row }) => {
      const status = row.original.status
      const indicator = match(status)
        .with('pending', () => (
          <MiniIndicatorBadge className="bg-neutral-500">
            {i18n.t('pages.embeddings.columns.Pending')}
          </MiniIndicatorBadge>
        ))
        .with('completed', () => (
          <MiniIndicatorBadge className="bg-green-500">
            {i18n.t('pages.embeddings.columns.Completed')}
          </MiniIndicatorBadge>
        ))
        .with('failed', () => (
          <MiniIndicatorBadge className="bg-destructive">
            {i18n.t('pages.embeddings.columns.Failed')}
          </MiniIndicatorBadge>
        ))
        .with('aborted', () => (
          <MiniIndicatorBadge className="bg-amber-500">
            {i18n.t('pages.embeddings.columns.Aborted')}
          </MiniIndicatorBadge>
        ))
        .exhaustive()
      return (
        <div className="flex items-center gap-2.5">
          {indicator}
          <span className="tabular-nums">{format(row.original.createdAt, 'MM-dd HH:mm:ss')}</span>
        </div>
      )
    },
  },
  {
    accessorKey: 'model',
    header: i18n.t('pages.embeddings.columns.Model'),
    cell: ({ row }) => {
      return <IndicatorBadge className="text-foreground bg-background border">{row.original.model}</IndicatorBadge>
    },
  },
  {
    accessorKey: 'input',
    header: i18n.t('pages.embeddings.columns.Input'),
    cell: ({ row }) => {
      const input = row.original.input
      const inputText = Array.isArray(input) ? input.join(', ') : input
      return (
        <InputContainer>
          <InputString text={inputText} />
          {Array.isArray(input) && input.length > 1 && (
            <IndicatorBadge className="shrink-0">+{input.length - 1}</IndicatorBadge>
          )}
        </InputContainer>
      )
    },
  },
  {
    accessorKey: 'inputTokens',
    header: () => <div className="text-right">{i18n.t('pages.embeddings.columns.Tokens')}</div>,
    cell: ({ row }) => {
      return <TokensString tokens={row.original.inputTokens} />
    },
  },
  {
    accessorKey: 'dimensions',
    header: () => <div className="text-right">{i18n.t('pages.embeddings.columns.Dimensions')}</div>,
    cell: ({ row }) => {
      return <div className="text-right tabular-nums">{formatNumber(row.original.dimensions)}</div>
    },
  },
  {
    accessorKey: 'duration',
    header: () => <div className="text-right">{i18n.t('pages.embeddings.columns.Duration')}</div>,
    cell: ({ row }) => <DurationDisplay duration={row.original.duration} />,
  },
]

function InputContainer({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex max-w-[180px] items-center gap-1 @5xl:max-w-[200px] @min-[75rem]:max-w-2xs @7xl:max-w-xs @min-[87rem]:max-w-sm @min-[103rem]:max-w-lg @min-[111rem]:max-w-xl @min-[123rem]:max-w-2xl @min-[135rem]:max-w-3xl @min-[152rem]:max-w-4xl',
        className,
      )}
      {...props}
    />
  )
}

function InputString({ text }: { text: string }) {
  return (
    <div className="truncate" title={text}>
      {text}
    </div>
  )
}

function TokensString({ tokens }: { tokens: number }) {
  const tokenString = match(tokens)
    .with(-1, () => '-')
    .with(1, () => '1')
    .otherwise((tokens) => `${formatNumber(tokens)}`)

  return tokenString && <div className="text-right tabular-nums">{tokenString}</div>
}

function DurationDisplay({ duration }: { duration: number | null }) {
  if (duration == null || duration === -1) return <div className="text-right">-</div>

  return (
    <div className="text-right tabular-nums">
      {(duration / 1000).toFixed(2)}
      {i18n.t('pages.embeddings.columns.Seconds')}
    </div>
  )
}
