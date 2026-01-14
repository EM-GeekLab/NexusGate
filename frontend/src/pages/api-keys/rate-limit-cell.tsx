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
  const remainingFromApi = type === 'rpm' ? usage.usage.rpm.remaining : usage.usage.tpm.remaining
  // Ensure remaining is not negative for display
  const remaining = Math.max(0, remainingFromApi)
  // Calculate percentage used (capped at 100%)
  const percentageUsed = limit > 0 ? Math.min(100, ((limit - remaining) / limit) * 100) : 0

  return (
    <div className="flex min-w-28 items-center gap-2">
      <Progress value={percentageUsed} className="h-2 w-16 flex-shrink-0" />
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {formatNumber(remaining)}/{formatNumber(limit)}
      </span>
    </div>
  )
}
