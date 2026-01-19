import type { ComponentProps, ReactNode } from 'react'
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  ForwardIcon,
  HelpCircleIcon,
  ReplyIcon,
  WrenchIcon,
  TerminalIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

type RequestMessage = ChatRequest['prompt']['messages'][number]
type ResponseMessage = ChatRequest['completion'][number]

// Tool call type from OpenAI format
interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// Tool definition type
interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

/**
 * Render a two-column pretty view that presents request metadata alongside prompt and completion messages.
 *
 * Displays a left metadata panel and two content sections: prompt (request) messages and completion (response) messages,
 * each with a header showing title, token counts, and message entries.
 *
 * @returns The JSX element for the messages pretty view UI.
 */
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
            title={t('pages.requests.detail-panel.pretty-view.RequestMessages')}
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
          <MessageTitle
            icon={<ReplyIcon />}
            title={t('pages.requests.detail-panel.pretty-view.ResponseMessages')}
            tokens={data.completionTokens}
          />
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

/**
 * Render a header bar showing an optional icon, title text, an optional length badge, and token usage.
 *
 * @param icon - Optional leading icon or element shown at the start of the header
 * @param title - Header text
 * @param tokens - Optional token count displayed by the TokenUsage indicator
 * @param length - Optional numeric badge shown next to the title (e.g., message count)
 * @param className - Additional CSS class names applied to the container
 */
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

/**
 * Render a single request message including role header, optional reasoning, message content, and tool-call details.
 *
 * The component displays the message role (and a terminal icon for tool messages), an optional `tool_call_id`, a collapsible
 * "Reasoning" section for assistant messages when present, the message body rendered as Markdown, and a list of tool calls
 * (each rendered with ToolCallDisplay) when `tool_calls` exist on the message.
 *
 * @param message - The request message to render
 * @returns A JSX element containing the formatted message block
 */
function MessageContent({ message }: { message: RequestMessage }) {
  const { t } = useTranslation()
  const messageText = getMessageText(message)

  // Check if this is a tool result message
  const isToolMessage = message.role === 'tool'
  const toolCallId = 'tool_call_id' in message ? (message as { tool_call_id?: string }).tool_call_id : undefined

  // Check if this is an assistant message with tool calls
  const toolCalls = 'tool_calls' in message ? (message as { tool_calls?: ToolCall[] }).tool_calls : undefined

  const { content, reasoning } = match(message)
    .with({ role: 'assistant' }, () => extractReasoning(messageText))
    .otherwise(() => ({ reasoning: null, content: messageText }))

  return (
    <div data-role={message.role} className="data-[role=user]:bg-muted/75 p-4 data-[role=system]:not-last:border-b data-[role=tool]:bg-amber-50/50 dark:data-[role=tool]:bg-amber-950/20">
      <h4 className="text-muted-foreground mb-3 flex items-center gap-1.5 text-sm/none font-semibold">
        {isToolMessage && <TerminalIcon className="size-3.5" />}
        {message.role}
        {toolCallId && (
          <span className="text-muted-foreground/70 font-mono text-xs">({toolCallId})</span>
        )}
      </h4>
      {reasoning && <ReasoningContent className="my-4" content={reasoning} />}
      {content && <Markdown text={content} />}
      {toolCalls && toolCalls.length > 0 && (
        <div className="mt-3 space-y-2">
          <h5 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <WrenchIcon className="size-3" />
            {t('pages.requests.detail-panel.pretty-view.ToolCalls')}
          </h5>
          {toolCalls.map((toolCall, index) => (
            <ToolCallDisplay key={toolCall.id || index} toolCall={toolCall} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Renders a response message block including reasoning, Markdown content, tool-call panels, refusal text, or an empty placeholder.
 *
 * Renders the message's extracted reasoning (in a collapsible panel) followed by the message content as Markdown when present; renders a Tool Calls section with a count badge and ToolCallDisplay entries when `tool_calls` are present; renders refusal text in a destructive-styled block when `refusal` is present; and shows a localized "No Content" placeholder if nothing else is rendered.
 *
 * @param message - The response message to render (may include `content`, `refusal`, and optional `tool_calls`).
 * @param className - Optional CSS class(es) applied to the outer container.
 * @returns A div element containing the assembled response message UI.
 */
function ResponseMessageContent({ message, className }: { message: ResponseMessage; className?: string }) {
  const { t } = useTranslation()
  const { content, refusal, tool_calls: toolCalls } = message as ResponseMessage & { tool_calls?: ToolCall[] }

  const renderResult: ReactNode[] = []

  if (content) {
    const { content: text, reasoning } = extractReasoning(content)
    renderResult.push(
      <div key="content-section">
        {reasoning && (
          <div className="p-4 pb-0">
            <ReasoningContent content={reasoning} defaultOpen />
          </div>
        )}
        <Markdown className="p-4" text={text} />
      </div>,
    )
  }

  if (toolCalls && toolCalls.length > 0) {
    renderResult.push(
      <div key="tool-calls" className="border-t p-4">
        <h5 className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs font-medium">
          <WrenchIcon className="size-3" />
          {t('pages.requests.detail-panel.pretty-view.ToolCalls')}
          <IndicatorBadge>{toolCalls.length}</IndicatorBadge>
        </h5>
        <div className="space-y-2">
          {toolCalls.map((toolCall, index) => (
            <ToolCallDisplay key={toolCall.id || index} toolCall={toolCall} />
          ))}
        </div>
      </div>,
    )
  }

  if (refusal) {
    renderResult.push(
      <div key="refusal" className="text-destructive bg-destructive/10 p-4 text-sm">
        {refusal}
      </div>,
    )
  }

  // Show placeholder if no content
  if (renderResult.length === 0) {
    renderResult.push(
      <div key="empty" className="text-muted-foreground p-4 text-sm italic">
        {t('pages.requests.detail-panel.pretty-view.NoContent')}
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
        {t('pages.requests.detail-panel.pretty-view.Reasoning')}
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
        <DescriptionItemButton>
          {(duration / 1000).toFixed(2)}
          {t('pages.requests.detail-panel.pretty-view.Seconds')}
        </DescriptionItemButton>
      </TooltipTrigger>
      <TooltipContent side="right">
        {formatNumber(duration)}
        {t('pages.requests.detail-panel.pretty-view.Milliseconds')}
      </TooltipContent>
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

/**
 * Render the metadata panel for a request in the pretty view.
 *
 * Displays request identifiers and details such as model, provider, timings (TTFT and duration),
 * token counts, tool definitions and choice, and any extra body or headers. Hidden fields are
 * omitted and some entries render interactive or formatted components (copyable model, duration
 * tooltips, collapsible tool definitions, JSON blocks).
 *
 * @returns A React element containing the structured meta information for the current request.
 */
function RequestMetaInfo() {
  const { t } = useTranslation()

  const data = useRequestDetailContext()

  // Extract tools from prompt (may be stored directly or in extraBody for older records)
  const promptData = data.prompt as {
    tools?: ToolDefinition[]
    tool_choice?: unknown
    extraBody?: Record<string, unknown>
    extraHeaders?: Record<string, string>
  }
  const tools = promptData.tools
  const toolChoice = promptData.tool_choice

  const descriptions: {
    key: string
    name: ReactNode
    value?: ReactNode
    help?: string
    className?: string
    hidden?: boolean
    fullWidth?: boolean // Display value on its own line
  }[] = [
    {
      key: 'id',
      name: t('pages.requests.detail-panel.pretty-view.RequestID'),
      value: String(data.id),
      className: 'tabular-nums',
    },
    {
      key: 'model',
      name: t('pages.requests.detail-panel.pretty-view.Model'),
      value: <CopiableText text={data.model} />,
    },
    {
      key: 'providerName',
      name: t('pages.requests.detail-panel.pretty-view.Provider'),
      value: data.providerName ?? '-',
      hidden: !data.providerName,
    },
    {
      key: 'ttft',
      name: t('pages.requests.detail-panel.pretty-view.TTFT'),
      value: <DurationDisplay duration={data.ttft} />,
      help: t('pages.requests.detail-panel.pretty-view.TimeToFirstToken'),
    },
    {
      key: 'duration',
      name: t('pages.requests.detail-panel.pretty-view.Duration'),
      value: <DurationDisplay duration={data.duration} />,
      help: t('pages.requests.detail-panel.pretty-view.DurationDesc'),
    },
    {
      key: 'promptTokens',
      name: t('pages.requests.detail-panel.pretty-view.RequestTokens'),
      value: data.promptTokens === -1 ? '-' : formatNumber(data.promptTokens),
      className: 'tabular-nums',
    },
    {
      key: 'completionTokens',
      name: t('pages.requests.detail-panel.pretty-view.ResponseTokens'),
      value: data.completionTokens === -1 ? '-' : formatNumber(data.completionTokens),
      className: 'tabular-nums',
    },
    {
      key: 'tools',
      name: (
        <span className="flex items-center gap-1.5">
          <WrenchIcon className="size-3" />
          {t('pages.requests.detail-panel.pretty-view.Tools')}
          <IndicatorBadge>{tools?.length ?? 0}</IndicatorBadge>
        </span>
      ),
      value: tools && tools.length > 0 ? <ToolsDefinitionDisplay tools={tools} /> : '-',
      hidden: !tools || tools.length === 0,
      fullWidth: true,
    },
    {
      key: 'toolChoice',
      name: t('pages.requests.detail-panel.pretty-view.ToolChoice'),
      value: toolChoice ? (
        typeof toolChoice === 'string' ? (
          <span className="font-mono text-xs">{toolChoice}</span>
        ) : (
          <pre className="bg-muted/50 max-w-full overflow-auto rounded px-2 py-1 font-mono text-xs whitespace-pre-wrap break-all">
            {JSON.stringify(toolChoice, null, 2)}
          </pre>
        )
      ) : '-',
      hidden: !toolChoice,
      fullWidth: typeof toolChoice === 'object',
    },
    {
      key: 'extraBody',
      name: t('pages.requests.detail-panel.pretty-view.ExtraBody'),
      value: <ExtraDataDisplay data={promptData.extraBody} />,
      hidden: !promptData.extraBody,
      fullWidth: true,
    },
    {
      key: 'extraHeaders',
      name: t('pages.requests.detail-panel.pretty-view.ExtraHeaders'),
      value: <ExtraDataDisplay data={promptData.extraHeaders} />,
      hidden: !promptData.extraHeaders,
      fullWidth: true,
    },
  ]

  return (
    <div className="@2xl:basis-[260px] @2xl:overflow-auto @2xl:border-r">
      <div className="px-4 pt-3 pb-2 @max-2xl:px-6">
        <h3 className="text-sm font-medium">{t('pages.requests.detail-panel.pretty-view.Meta')}</h3>
      </div>
      <div className="rounded-lg px-2 py-0.5 @max-2xl:mx-3 @max-2xl:mb-3 @max-2xl:border">
        <TooltipProvider>
          {descriptions
            .filter((d) => !d.hidden)
            .map(({ key, name, value, help, className, fullWidth }) => (
              <dl
                key={key}
                className={cn('gap-2 p-2 not-last:border-b', fullWidth ? 'flex flex-col' : 'flex items-center justify-between')}
              >
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
                <dd className={cn('text-sm', fullWidth ? '' : 'justify-self-end', className)}>{value}</dd>
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

function ExtraDataDisplay({ data }: { data?: Record<string, unknown> }) {
  if (!data) return '-'

  const entries = Object.entries(data)
  if (entries.length === 0) return '-'

  return (
    <pre className="bg-muted/50 max-w-full overflow-auto rounded px-2 py-1 font-mono text-xs whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

/**
 * Extracts and returns the text content from a RequestMessage.
 *
 * If the message's `content` is a string, that string is returned. If the message has a structured `content`
 * (an array of parts) and the role is one of `user`, `assistant`, `system`, `developer`, or `tool`, the function
 * concatenates all parts whose `type` is `'text'` and returns the combined text. If no text can be obtained,
 * an empty string is returned.
 *
 * @param message - The request message to extract text from
 * @returns The extracted text, or an empty string if none is available
 */
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

/**
 * Render a collapsible panel showing a single tool call's name, id, and arguments.
 *
 * @param toolCall - The tool call object containing `id`, `function.name`, and `function.arguments`.
 * @returns A JSX element that displays the tool's name and id in the header and the parsed or raw arguments in a collapsible content area.
 */
function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  const { t } = useTranslation()

  // Parse arguments if it's a string
  let parsedArgs: Record<string, unknown> | null = null
  try {
    parsedArgs = typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments
  } catch {
    // If parsing fails, leave as null and show raw string
  }

  return (
    <Collapsible
      defaultOpen
      className="border-border/50 data-[state=open]:border-border overflow-hidden rounded-md border transition-colors"
    >
      <CollapsibleTrigger className="group/collapsible bg-secondary/50 text-secondary-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-background data-[state=open]:hover:bg-accent flex w-full items-center justify-between px-3 py-2 text-sm transition-colors data-[state=open]:font-medium [&_svg]:size-4">
        <span className="flex items-center gap-2">
          <WrenchIcon className="size-3.5" />
          <span className="font-mono">{toolCall.function.name}</span>
          <span className="text-muted-foreground/70 font-mono text-xs">({toolCall.id})</span>
        </span>
        <ChevronRightIcon className="-mr-1 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 pt-2">
          <div className="text-muted-foreground mb-1 text-xs font-medium">
            {t('pages.requests.detail-panel.pretty-view.Arguments')}
          </div>
          <pre className="bg-muted/50 max-h-64 overflow-auto rounded px-2 py-1 font-mono text-xs whitespace-pre-wrap break-all">
            {parsedArgs ? JSON.stringify(parsedArgs, null, 2) : toolCall.function.arguments}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Renders a list of tool definitions as collapsible panels showing each tool's name,
 * optional description, and optional parameters.
 *
 * @param tools - Array of tool definitions to display; each entry's `function` object should include `name`, and may include `description` and `parameters`
 */
function ToolsDefinitionDisplay({ tools }: { tools: ToolDefinition[] }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      {tools.map((tool, index) => (
        <Collapsible
          key={tool.function.name + index}
          className="border-border/50 data-[state=open]:border-border overflow-hidden rounded-md border transition-colors"
        >
          <CollapsibleTrigger className="group/collapsible bg-secondary/50 text-secondary-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-background data-[state=open]:hover:bg-accent flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors data-[state=open]:font-medium [&_svg]:size-3.5">
            <span className="flex items-center gap-1.5">
              <WrenchIcon className="size-3" />
              <span className="font-mono">{tool.function.name}</span>
            </span>
            <ChevronRightIcon className="-mr-1 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 p-2 pt-1">
              {tool.function.description && (
                <div>
                  <div className="text-muted-foreground mb-0.5 text-[10px] font-medium uppercase">
                    {t('pages.requests.detail-panel.pretty-view.Description')}
                  </div>
                  <p className="text-xs">{tool.function.description}</p>
                </div>
              )}
              {tool.function.parameters && (
                <div>
                  <div className="text-muted-foreground mb-0.5 text-[10px] font-medium uppercase">
                    {t('pages.requests.detail-panel.pretty-view.Parameters')}
                  </div>
                  <pre className="bg-muted/50 max-h-48 overflow-auto rounded px-2 py-1 font-mono text-[10px] whitespace-pre-wrap break-all">
                    {JSON.stringify(tool.function.parameters, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  )
}