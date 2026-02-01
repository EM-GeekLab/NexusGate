import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface QueryInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  className?: string
}

type FieldInfo = {
  name: string
  type: string
  description: string
  values?: string[]
  nested?: boolean
}

const KEYWORDS = ['AND', 'OR', 'NOT', '| stats', 'by']
const AGG_FUNCTIONS = ['count()', 'avg(', 'sum(', 'min(', 'max(', 'p50(', 'p95(', 'p99(']

export function QueryInput({ value, onChange, onSubmit, className }: QueryInputProps) {
  const [open, setOpen] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch field metadata for autocomplete
  const { data: fieldsData } = useQuery({
    queryKey: ['search-fields'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (api.admin.search.fields as any).get()
      if (error) return { fields: [] as FieldInfo[] }
      return data as { fields: FieldInfo[] }
    },
    staleTime: 60_000,
  })

  const fields = useMemo(() => fieldsData?.fields ?? [], [fieldsData])

  // Build suggestions based on cursor context
  const getSuggestions = useCallback((): { label: string; description?: string; insert: string }[] => {
    const cursorText = value.trimEnd()
    const lastToken = cursorText.split(/\s+/).pop() || ''

    // After a pipe, suggest "stats"
    if (cursorText.endsWith('|') || cursorText.endsWith('| ')) {
      return [{ label: 'stats', description: 'Aggregate results', insert: 'stats ' }]
    }

    // After "stats", suggest aggregate functions
    if (/\|\s*stats\s*$/i.test(cursorText) || /,\s*$/i.test(cursorText)) {
      return AGG_FUNCTIONS.map((fn) => ({
        label: fn,
        description: 'Aggregate function',
        insert: fn,
      }))
    }

    // After "by", suggest fields
    if (/\bby\s*$/i.test(cursorText)) {
      return fields.map((f) => ({
        label: f.name,
        description: f.description,
        insert: f.name + ' ',
      }))
    }

    // After an operator (:, =, >=, etc.), suggest values for the field
    const fieldMatch = cursorText.match(/(\w[\w.]*)\s*(?::|=|!=|>=?|<=?)\s*$/)
    if (fieldMatch) {
      const fieldName = fieldMatch[1]
      const field = fields.find((f) => f.name === fieldName)
      if (field?.values && field.values.length > 0) {
        return field.values.map((v) => ({
          label: `"${v}"`,
          description: `${field.name} value`,
          insert: `"${v}" `,
        }))
      }
      return []
    }

    // Default: suggest field names and keywords
    const suggestions: { label: string; description?: string; insert: string }[] = []

    // Filter field names by what user has typed
    const lowerToken = lastToken.toLowerCase()
    for (const field of fields) {
      if (!lowerToken || field.name.toLowerCase().startsWith(lowerToken)) {
        suggestions.push({
          label: field.name,
          description: field.description,
          insert: field.name + ': ',
        })
      }
    }

    // Add keywords
    for (const kw of KEYWORDS) {
      if (!lowerToken || kw.toLowerCase().startsWith(lowerToken)) {
        suggestions.push({
          label: kw,
          description: 'Keyword',
          insert: kw + ' ',
        })
      }
    }

    return suggestions.slice(0, 12)
  }, [value, fields])

  const suggestions = getSuggestions()

  // Validate query on change (debounced)
  useEffect(() => {
    if (!value.trim()) {
      setValidationError(null)
      return
    }

    const timeout = setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (api.admin.search.validate as any).post({
          query: value,
        })
        if (error || !data) {
          setValidationError(null)
          return
        }
        if (data.valid) {
          setValidationError(null)
        } else if (data.error) {
          setValidationError(data.error.message)
        }
      } catch {
        // Ignore validation errors during typing
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [value])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      setOpen(false)
      onSubmit()
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleSuggestionClick = (insert: string) => {
    // Replace the last partial token with the suggestion
    const parts = value.trimEnd().split(/\s+/)
    const lastToken = parts[parts.length - 1] || ''

    let newValue: string
    if (lastToken && insert.toLowerCase().startsWith(lastToken.toLowerCase())) {
      // Replace the partial match
      parts[parts.length - 1] = insert
      newValue = parts.join(' ')
    } else {
      // Append
      newValue = value.trimEnd() + (value.endsWith(' ') || !value ? '' : ' ') + insert
    }

    onChange(newValue)
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative flex-1">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => {
                onChange(e.target.value)
                if (e.target.value) setOpen(true)
              }}
              onFocus={() => {
                if (value || suggestions.length > 0) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              placeholder='model: "gpt-4" AND status: completed'
              className={cn(
                'pl-9 font-mono text-sm',
                validationError && 'border-destructive focus-visible:ring-destructive',
              )}
            />
            {validationError && (
              <p className="text-destructive absolute -bottom-5 left-0 text-xs">{validationError}</p>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-1"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-60 overflow-y-auto">
            {suggestions.map((suggestion, i) => (
              <button
                key={`${suggestion.label}-${i}`}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                onMouseDown={(e) => e.preventDefault()} // prevent blur
                onClick={() => handleSuggestionClick(suggestion.insert)}
              >
                <span className="font-mono font-medium">{suggestion.label}</span>
                {suggestion.description && (
                  <span className="text-muted-foreground text-xs">{suggestion.description}</span>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Button size="sm" onClick={onSubmit}>
        Search
      </Button>
    </div>
  )
}
