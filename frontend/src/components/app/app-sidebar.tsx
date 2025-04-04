import { Link, useMatchRoute } from '@tanstack/react-router'
import { ArrowUpDownIcon, LayoutGridIcon, PackageIcon, WaypointsIcon } from 'lucide-react'

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

import { AppSidebarFooter } from './app-sidebar-footer'

import i18n from '@/i18n'
import { useTranslation } from 'react-i18next'

const navItems = [
  // {
  //   icon: <ChartPieIcon />,
  //   title: 'Overview',
  //   href: '/',
  // },
  {
    icon: <ArrowUpDownIcon />,
    title:i18n.t( 'Requests'),
    href: '/requests',
  },
  {
    icon: <LayoutGridIcon />,
    title: i18n.t('Applications'),
    href: '/apps',
  },
  {
    icon: <PackageIcon />,
    title: i18n.t('Providers'),
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
                  <span className="truncate font-semibold">{t('NexusGate')}</span>
                  <span className="truncate text-xs">{t('LLM.Gateway')}</span>
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
