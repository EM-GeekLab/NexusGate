import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { cn } from '@/lib/utils'

import './highlightjs-theme-github.css'

export function Markdown({ text, className, size = 'sm' }: { text: string; className?: string; size?: 'sm' | 'base' }) {
  return (
    <div
      className={cn(
        'prose prose-neutral dark:prose-invert prose-code:font-mono prose-pre:bg-muted/50 prose-pre:text-foreground/80 prose-blockquote:not-italic prose-blockquote:text-foreground/75 prose-blockquote:font-normal max-w-none',
        {
          sm: 'prose-sm prose-code:text-xs',
          base: 'prose-base prose-code:text-sm',
        }[size],
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
