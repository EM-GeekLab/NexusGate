import { Link, useMatchRoute } from '@tanstack/react-router'
import { ArrowUpDownIcon, BoxIcon, ChartPieIcon, LayoutGridIcon, SettingsIcon, WaypointsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import i18n from '@/i18n'

import { AppSidebarFooter } from './app-sidebar-footer'

const navItems = [
  {
    icon: <ChartPieIcon className="size-4" />,
    title: i18n.t('components.app.app-sidebar.Overview'),
    href: '/',
  },
  {
    icon: <ArrowUpDownIcon className="size-4" />,
    title: i18n.t('components.app.app-sidebar.Requests'),
    href: '/requests',
  },
  {
    icon: <BoxIcon className="size-4" />,
    title: i18n.t('components.app.app-sidebar.Embeddings'),
    href: '/embeddings',
  },
  {
    icon: <LayoutGridIcon className="size-4" />,
    title: i18n.t('components.app.app-sidebar.Applications'),
    href: '/apps',
  },
  {
    icon: <SettingsIcon className="size-4" />,
    title: i18n.t('components.app.app-sidebar.Settings'),
    href: '/settings',
  },
]

export function AppSidebar() {
  const { t } = useTranslation()

  const { setOpenMobile } = useSidebar()
  const matchRoute = useMatchRoute()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              asChild
            >
              <Link to="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                  <WaypointsIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{t('components.app.app-sidebar.NexusGate')}</span>
                  <span className="truncate text-xs">{t('components.app.app-sidebar.LLMGateway')}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3 py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navItems.map((item) => {
                const isActive = !!matchRoute({ to: item.href, fuzzy: true })
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={{ children: item.title }}
                      asChild
                      className={cn(
                        'h-10 gap-3 rounded-lg px-3',
                        isActive && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                      )}
                    >
                      <Link to={item.href} onClick={() => setOpenMobile(false)}>
                        {item.icon}
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="overflow-hidden">
        <AppSidebarFooter />
      </SidebarFooter>
    </Sidebar>
  )
}
