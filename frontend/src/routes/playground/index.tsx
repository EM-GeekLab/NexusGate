import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/playground/')({
  component: () => <Navigate to="/playground/chat" />,
})
