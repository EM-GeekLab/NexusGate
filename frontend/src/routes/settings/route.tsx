import { createFileRoute, Link, Outlet, useMatchRoute } from '@tanstack/react-router'
import { BoxesIcon, CpuIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import {
  AppHeader,
  AppHeaderPart,
  AppHeaderTitle,
  AppSidebarSeparator,
  AppSidebarTrigger,
} from '@/components/app/app-header'

export const Route = createFileRoute('/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()
  const matchRoute = useMatchRoute()

  const navItems = [
    {
      icon: <BoxesIcon className="size-4" />,
      title: t('routes.settings.nav.Providers'),
      href: '/settings/providers',
    },
    {
      icon: <CpuIcon className="size-4" />,
      title: t('routes.settings.nav.Models'),
      href: '/settings/models',
    },
  ]

  return (
    <>
      <AppHeader>
        <AppHeaderPart>
          <AppSidebarTrigger />
          <AppSidebarSeparator />
          <AppHeaderTitle>{t('routes.settings.Title')}</AppHeaderTitle>
        </AppHeaderPart>
      </AppHeader>
      <main className="flex flex-1 border-t">
        <div className="w-56 border-r px-3 pb-4 pt-8">
          <nav className="space-y-2">
            {navItems.map((item) => {
              const isActive = !!matchRoute({ to: item.href, fuzzy: true })
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.icon}
                  {item.title}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </main>
    </>
  )
}
