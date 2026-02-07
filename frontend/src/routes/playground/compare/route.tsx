import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/playground/compare')({
  component: () => <Outlet />,
})
