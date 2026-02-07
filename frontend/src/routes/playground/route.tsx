import { createFileRoute, Link, Outlet, useMatchRoute } from '@tanstack/react-router'
import { FlaskConicalIcon, GitCompareArrowsIcon, MenuIcon, MessageSquareIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import {
  AppHeader,
  AppHeaderPart,
  AppHeaderTitle,
  AppSidebarSeparator,
  AppSidebarTrigger,
} from '@/components/app/app-header'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'

export const Route = createFileRoute('/playground')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()
  const matchRoute = useMatchRoute()
  const isMobile = useIsMobile()

  const navItems = [
    {
      icon: <MessageSquareIcon className="size-4" />,
      title: t('routes.playground.nav.Chat'),
      href: '/playground/chat',
    },
    {
      icon: <GitCompareArrowsIcon className="size-4" />,
      title: t('routes.playground.nav.Compare'),
      href: '/playground/compare',
    },
  ]

  const renderNav = () => (
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
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.icon}
            {item.title}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="flex h-svh flex-col">
      <AppHeader>
        <AppHeaderPart>
          <AppSidebarTrigger />
          <AppSidebarSeparator />
          {isMobile && (
            <>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MenuIcon className="size-4" />
                    <span className="sr-only">Toggle Playground Menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-56 p-0">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Playground Navigation</SheetTitle>
                    <SheetDescription>Navigate between playground pages</SheetDescription>
                  </SheetHeader>
                  <div className="px-3 pt-8 pb-4">{renderNav()}</div>
                </SheetContent>
              </Sheet>
              <AppSidebarSeparator />
            </>
          )}
          <FlaskConicalIcon className="size-4" />
          <AppHeaderTitle>{t('routes.playground.Title')}</AppHeaderTitle>
        </AppHeaderPart>
      </AppHeader>

      <main className="flex min-h-0 flex-1 border-t">
        <div className="hidden w-48 shrink-0 border-r px-3 py-8 md:block lg:w-56">{renderNav()}</div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
