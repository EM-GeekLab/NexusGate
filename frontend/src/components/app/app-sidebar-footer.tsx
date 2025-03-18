import { useQuery } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { GithubIcon } from '@/components/app/github-icon'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { useSidebar } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function AppSidebarFooter() {
  const { isMobile, state } = useSidebar()

  return (
    <TooltipProvider>
      <div className="flex w-[calc(var(--sidebar-width)-1rem)] items-center justify-between gap-2">
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="text-muted-foreground size-8 p-0" asChild>
                <a href="https://github.com/EM-GeekLab/NexusGate" target="_blank" rel="noreferrer">
                  <GithubIcon />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side={state === 'collapsed' || isMobile ? 'right' : 'top'}>GitHub</TooltipContent>
          </Tooltip>
          <CommitSha />
        </div>
      </div>
    </TooltipProvider>
  )
}

function CommitSha() {
  const sha: string | undefined = import.meta.env.VITE_COMMIT_SHA

  const { data: backendSha = '' } = useQuery({
    queryKey: ['version'],
    queryFn: async () => {
      const { data, error } = await api.admin.rev.get()
      if (error) throw formatError(error, 'Failed to fetch commit sha')
      return data.version
    },
    enabled: !!sha,
    staleTime: Infinity,
  })

  const { data: githubSha = '' } = useQuery({
    queryKey: ['github-head'],
    queryFn: async () => {
      const res = await fetch('https://api.github.com/repos/EM-GeekLab/NexusGate/commits/main')
      if (!res.ok) {
        throw new Error('Failed to fetch commit sha')
      }
      const data = (await res.json()) as { sha: string }
      return data.sha
    },
    enabled: !!sha,
    staleTime: Infinity,
  })

  const isBackendShaEqual = backendSha == null ? true : backendSha === sha

  if (!sha) return null

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          data-warning={!isBackendShaEqual ? '' : undefined}
          className="text-muted-foreground hover:text-accent-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs data-warning:text-amber-500 [&_svg]:size-3.5"
        >
          {!isBackendShaEqual && <TriangleAlertIcon />}
          {sha.substring(0, 7)}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        data-warning={!isBackendShaEqual ? '' : undefined}
        className="w-auto max-w-[15rem] p-2 data-warning:border-amber-500"
      >
        {!isBackendShaEqual && (
          <div className="mb-2 text-xs text-amber-500">The backend version is different from the frontend version.</div>
        )}
        <div className="grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-1 text-xs">
          <div className="contents">
            <div className="text-muted-foreground">{isBackendShaEqual ? 'Current version' : 'Frontend version'}</div>
            <div>{sha.substring(0, 7)}</div>
          </div>
          {!isBackendShaEqual && (
            <div className="contents">
              <div className="text-muted-foreground">Backend version</div>
              <div>{backendSha.substring(0, 7)}</div>
            </div>
          )}
          {githubSha && (
            <div className="contents">
              <div className="text-muted-foreground">Latest version</div>
              <div>{githubSha.substring(0, 7)}</div>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
