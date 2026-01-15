import type { CSSProperties } from 'react'

/**
 * Common tooltip content style for all charts.
 * Ensures proper background color, border, and shadow for readability.
 */
export const tooltipContentStyle: CSSProperties = {
  backgroundColor: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  padding: '8px 12px',
}

/**
 * Common tooltip label style for all charts.
 */
export const tooltipLabelStyle: CSSProperties = {
  color: 'hsl(var(--foreground))',
  fontWeight: 500,
  marginBottom: '4px',
}

/**
 * Common tooltip item style for all charts.
 */
export const tooltipItemStyle: CSSProperties = {
  color: 'hsl(var(--foreground))',
}
