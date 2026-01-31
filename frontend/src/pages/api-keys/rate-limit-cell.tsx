import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

interface RateLimitCellProps {
  apiKey: string
  type: 'rpm' | 'tpm'
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`
  }
  return num.toString()
}

export function RateLimitCell({ apiKey, type }: RateLimitCellProps) {
  const { data: usage, isLoading } = useQuery({
    queryKey: ['apiKeyUsage', apiKey],
    queryFn: async () => {
      const { data, error } = await api.admin.apiKey({ key: apiKey }).usage.get()
      if (error) throw error
      return data
    },
    refetchInterval: 10000, // Refresh every 10s
    staleTime: 5000,
  })

  if (isLoading) {
    return <Skeleton className="h-6 w-24" />
  }

  if (!usage) {
    return <span className="text-muted-foreground text-sm">-</span>
  }

  const limit = type === 'rpm' ? usage.limits.rpm : usage.limits.tpm
  const current = type === 'rpm' ? usage.usage.rpm.current : usage.usage.tpm.current
  // Calculate percentage used (capped at 100% for progress bar)
  const percentageUsed = limit > 0 ? Math.min(100, (current / limit) * 100) : 0
  // Check if over limit (burst usage)
  const isOverLimit = current > limit

  return (
    <div className="flex min-w-28 items-center gap-2">
      <Progress value={percentageUsed} className="h-2 w-16 flex-shrink-0" />
      <span
        className={`text-xs whitespace-nowrap ${isOverLimit ? 'font-medium text-orange-500' : 'text-muted-foreground'}`}
      >
        {formatNumber(current)}/{formatNumber(limit)}
      </span>
    </div>
  )
}
