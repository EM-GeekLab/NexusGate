import { Link, useMatchRoute } from '@tanstack/react-router'
import { ArrowUpDownIcon, BoxIcon, LayoutGridIcon, PackageIcon, WaypointsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
  // {
  //   icon: <ChartPieIcon />,
  //   title: 'Overview',
  //   href: '/',
  // },
  {
    icon: <ArrowUpDownIcon />,
    title: i18n.t('components.app.app-sidebar.Requests'),
    href: '/requests',
  },
  {
    icon: <BoxIcon />,
    title: i18n.t('components.app.app-sidebar.Embeddings'),
    href: '/embeddings',
  },
  {
    icon: <LayoutGridIcon />,
    title: i18n.t('components.app.app-sidebar.Applications'),
    href: '/apps',
  },
  {
    icon: <PackageIcon />,
    title: i18n.t('components.app.app-sidebar.Providers'),
    href: '/providers',
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={!!matchRoute({ to: item.href, fuzzy: true })}
                    tooltip={{ children: item.title }}
                    asChild
                  >
                    <Link to={item.href} onClick={() => setOpenMobile(false)}>
                      {item.icon}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
