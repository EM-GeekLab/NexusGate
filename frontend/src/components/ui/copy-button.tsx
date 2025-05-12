import type { ComponentProps } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useCopy, type UseCopyOptions } from '@/hooks/use-copy'

export function CopyButton({
  value,
  className,
  children,
  timeout,
  showSuccessToast,
  showErrorToast,
  successToastMessage,
  ...props
}: ComponentProps<typeof Button> & UseCopyOptions & { value: string }) {
  const { copy, copied } = useCopy({ timeout, showErrorToast, showSuccessToast, successToastMessage })
  const Icon = copied ? CheckIcon : CopyIcon

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('group font-normal', className)}
      title="click to copy"
      onClick={() => copy(value)}
      {...props}
    >
      <span className="tabular-nums">{children}</span>
      <span className="sr-only">Copy API key</span>
      <Icon
        data-copied={copied ? '' : undefined}
        className="size-3.5 opacity-0 group-hover:opacity-80 data-copied:opacity-100"
      />
    </Button>
  )
}
