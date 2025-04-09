import type { ComponentProps, ReactNode } from 'react'
import { CheckIcon, ChevronRightIcon, CopyIcon, ForwardIcon, HelpCircleIcon, ReplyIcon } from 'lucide-react'
import { match, P } from 'ts-pattern'

import { extractReasoning } from '@/lib/content'
import { cn, formatNumber } from '@/lib/utils'
import { Markdown } from '@/components/app/markdown'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { IndicatorBadge } from '@/components/ui/indicator-badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCopy } from '@/hooks/use-copy'

import type { ChatRequest } from '../columns'
import { useRequestDetailContext } from './index'
import { TokenUsage } from './token-usage'

import { useTranslation } from 'react-i18next'

type RequestMessage = ChatRequest['prompt']['messages'][number]
type ResponseMessage = ChatRequest['completion'][number]

export function MessagesPrettyView() {
  const { t } = useTranslation()

  const data = useRequestDetailContext()

  return (
    <div className="flex flex-1 flex-col overflow-auto @2xl:flex-row @2xl:overflow-hidden">
      <RequestMetaInfo />
      <div className="grid flex-1 @max-2xl:border-t @2xl:overflow-auto @6xl:grid-cols-2 @6xl:overflow-hidden">
        <MessagesPrettyContainer className="@6xl:border-r">
          <MessageTitle
            icon={<ForwardIcon />}
            title={t('Src_pages_requests_detail-panel_pretty-view_RequestMessages')}
            length={data.prompt.messages.length}
            tokens={data.promptTokens}
          />
          <div className="flex flex-col">
            {data.prompt.messages.map((message, index) => (
              <MessageContent key={index} message={message} />
            ))}
          </div>
        </MessagesPrettyContainer>
        <MessagesPrettyContainer>
          <MessageTitle icon={<ReplyIcon />} title={t('Src_pages_requests_detail-panel_pretty-view_ResponseMessages')} tokens={data.completionTokens} />
          <div className="flex flex-col">
            {data.completion.map((message, index) => (
              <ResponseMessageContent key={index} message={message} />
            ))}
          </div>
        </MessagesPrettyContainer>
      </div>
    </div>
  )
}

function MessagesPrettyContainer({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-w-0 border-b @6xl:relative @6xl:overflow-auto', className)} {...props} />
}

function MessageTitle({
  icon,
  title,
  tokens,
  length,
  className,
}: {
  icon?: ReactNode
  title: string
  tokens?: number
  length?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-background sticky top-0 flex items-center gap-2 border-b px-4 py-2.5 [&_svg]:size-3.5',
        className,
      )}
    >
      {icon}
      <h3 className="text-sm font-medium">{title}</h3>
      {length != undefined && <IndicatorBadge>{length}</IndicatorBadge>}
      <TokenUsage tokens={tokens} />
    </div>
  )
}

function MessageContent({ message }: { message: RequestMessage }) {
  const messageText = getMessageText(message)

  const { content, reasoning } = match(message)
    .with({ role: 'assistant' }, () => extractReasoning(messageText))
    .otherwise(() => ({ reasoning: null, content: messageText }))

  return (
    <div data-role={message.role} className="data-[role=user]:bg-muted/75 p-4 data-[role=system]:not-last:border-b">
      <h4 className="text-muted-foreground mb-3 text-sm/none font-semibold">{message.role}</h4>
      {reasoning && <ReasoningContent className="my-4" content={reasoning} />}
      <Markdown text={content} />
    </div>
  )
}

function ResponseMessageContent({ message, className }: { message: ResponseMessage; className?: string }) {
  const { content, refusal } = message

  const renderResult: ReactNode[] = []

  if (content) {
    const { content: text, reasoning } = extractReasoning(content)
    renderResult.push(
      <>
        {reasoning && (
          <div className="p-4 pb-0">
            <ReasoningContent key="reasoning" content={reasoning} defaultOpen />
          </div>
        )}
        <Markdown key="content" className="p-4" text={text} />
      </>,
    )
  }

  if (refusal) {
    renderResult.push(
      <div key="refusal" className="text-destructive bg-destructive/10 p-4 text-sm">
        {refusal}
      </div>,
    )
  }

  return <div className={className}>{renderResult}</div>
}

function ReasoningContent({ content, className, ...props }: { content: string } & ComponentProps<typeof Collapsible>) {
  const { t } = useTranslation()
  return (
    <Collapsible
      className={cn(
        'border-border/50 data-[state=open]:border-border overflow-hidden rounded-md border transition-colors',
        className,
      )}
      {...props}
    >
      <CollapsibleTrigger className="group/collapsible bg-secondary/50 text-secondary-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-background data-[state=open]:hover:bg-accent flex w-full items-center justify-between px-4 py-2 text-sm transition-colors data-[state=open]:font-medium [&_svg]:size-4">
        {t('Src_pages_requests_detail-panel_pretty-view_Reasoning')}
        <ChevronRightIcon className="-mr-1 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Markdown className="p-4 pt-2" text={content} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function DurationDisplay({ duration }: { duration?: number | null }) {
  const { t } = useTranslation()
  
  if (duration == null || duration === -1) return '-'

  return (
    <Tooltip>
      <TooltipTrigger className="tabular-nums" asChild>
        <DescriptionItemButton>{(duration / 1000).toFixed(2)}{t('Src_pages_requests_detail-panel_pretty-view_Seconds')}</DescriptionItemButton>
      </TooltipTrigger>
      <TooltipContent side="right">{formatNumber(duration)}{t('Src_pages_requests_detail-panel_pretty-view_Milliseconds')}</TooltipContent>
    </Tooltip>
  )
}

function CopiableText({ text }: { text: string }) {
  const { copy, copied } = useCopy({ showSuccessToast: true })

  return (
    <DescriptionItemButton onClick={() => copy(text)} className="group gap-0">
      {text}
      <span className="text-muted-foreground w-0 overflow-hidden pl-0 transition-[width,padding] group-hover:w-4 group-hover:pl-1 [&_svg]:size-3">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </span>
    </DescriptionItemButton>
  )
}

function RequestMetaInfo() {
  const { t } = useTranslation()

  const data = useRequestDetailContext()

  const descriptions: {
    key: keyof typeof data
    name: ReactNode
    value?: ReactNode
    help?: string
    className?: string
  }[] = [
    {
      key: 'id',
      name: t('Src_pages_requests_detail-panel_pretty-view_RequestID'),
      className: 'tabular-nums',
    },
    {
      key: 'model',
      name: t('Src_pages_requests_detail-panel_pretty-view_Model'),
      value: <CopiableText text={data.model} />,
    },
    {
      key: 'ttft',
      name: t('Src_pages_requests_detail-panel_pretty-view_TTFT'),
      value: <DurationDisplay duration={data.ttft} />,
      help: t('Src_pages_requests_detail-panel_pretty-view_TimeToFirstToken'),
    },
    {
      key: 'duration',
      name: t('Src_pages_requests_detail-panel_pretty-view_Duration'),
      value: <DurationDisplay duration={data.duration} />,
      help: t('Src_pages_requests_detail-panel_pretty-view_DurationDesc'),
    },
    {
      key: 'promptTokens',
      name: t('Src_pages_requests_detail-panel_pretty-view_RequestTokens'),
      value: data.promptTokens === -1 ? '-' : formatNumber(data.promptTokens),
      className: 'tabular-nums',
    },
    {
      key: 'completionTokens',
      name: t('Src_pages_requests_detail-panel_pretty-view_ResponseTokens'),
      value: data.completionTokens === -1 ? '-' : formatNumber(data.completionTokens),
      className: 'tabular-nums',
    },
  ]

  return (
    <div className="@2xl:basis-[260px] @2xl:overflow-auto @2xl:border-r">
      <div className="px-4 pt-3 pb-2 @max-2xl:px-6">
        <h3 className="text-sm font-medium">{t('Src_pages_requests_detail-panel_pretty-view_Meta')}</h3>
      </div>
      <div className="rounded-lg px-2 py-0.5 @max-2xl:mx-3 @max-2xl:mb-3 @max-2xl:border">
        <TooltipProvider>
          {descriptions.map(({ key, name, value, help, className }) => (
            <dl key={key} className="flex items-center justify-between gap-2 p-2 not-last:border-b">
              <dt className="text-muted-foreground flex items-center gap-1 text-sm">
                {name}
                {help && (
                  <Tooltip>
                    <TooltipTrigger
                      className="text-muted-foreground hover:text-accent-foreground transition-colors"
                      asChild
                    >
                      <HelpCircleIcon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>{help}</TooltipContent>
                  </Tooltip>
                )}
              </dt>
              <dd className={cn('justify-self-end text-sm', className)}>{value ?? String(data[key])}</dd>
            </dl>
          ))}
        </TooltipProvider>
      </div>
    </div>
  )
}

function DescriptionItemButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={cn(
        'hover:bg-accent hover:text-accent-foreground -mx-1.5 -my-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition',
        className,
      )}
      {...props}
    />
  )
}

function getMessageText(message: RequestMessage): string {
  return match(message)
    .with({ content: P.string }, (msg) => msg.content)
    .with(
      {
        role: P.union('user', 'assistant', 'system', 'developer', 'tool'),
        content: P.intersection(P.not(P.string), P.nonNullable),
      },
      (msg) =>
        msg.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join(''),
    )
    .otherwise(() => '')
}
