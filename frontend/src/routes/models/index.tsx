import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/models/')({
  component: () => <Navigate to="/models/providers" />,
})
