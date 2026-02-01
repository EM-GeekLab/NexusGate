import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface AggregationResultsProps {
  results: Record<string, unknown>[]
}

export function AggregationResults({ results }: AggregationResultsProps) {
  if (results.length === 0) {
    return <div className="text-muted-foreground py-12 text-center text-sm">No aggregation results</div>
  }

  // Get column names from first result
  const columns = Object.keys(results[0])

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="bg-background sticky top-0">
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col} className="font-mono text-xs">
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col} className="font-mono">
                  {formatAggValue(row[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  )
}

function formatAggValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  if (typeof value === 'string') {
    // Try to format as number if it looks like one
    const num = Number(value)
    if (!Number.isNaN(num)) {
      return Number.isInteger(num) ? String(num) : num.toFixed(2)
    }
  }
  return String(value)
}
