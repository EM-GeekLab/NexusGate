import type { Token, TokenType } from './types'

const KEYWORDS: Record<string, TokenType> = {
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  EXISTS: 'EXISTS',
  stats: 'STATS',
  by: 'BY',
}

const OPERATORS = new Set([':', '=', '!=', '>', '>=', '<', '<='])

export class LexerError extends Error {
  constructor(
    message: string,
    public position: number,
    public length: number,
  ) {
    super(message)
    this.name = 'LexerError'
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  const charAt = (i: number): string => input.charAt(i)

  while (pos < input.length) {
    // Skip whitespace
    if (/\s/.test(charAt(pos))) {
      pos++
      continue
    }

    const start = pos
    const ch = charAt(pos)

    // Single-character tokens
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: start })
      pos++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: start })
      pos++
      continue
    }
    if (ch === '|') {
      tokens.push({ type: 'PIPE', value: '|', position: start })
      pos++
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',', position: start })
      pos++
      continue
    }

    // Operators: !=, >=, <=, >, <, =, :
    if (ch === '!' && pos + 1 < input.length && charAt(pos + 1) === '=') {
      tokens.push({ type: 'OPERATOR', value: '!=', position: start })
      pos += 2
      continue
    }
    if (ch === '>' && pos + 1 < input.length && charAt(pos + 1) === '=') {
      tokens.push({ type: 'OPERATOR', value: '>=', position: start })
      pos += 2
      continue
    }
    if (ch === '<' && pos + 1 < input.length && charAt(pos + 1) === '=') {
      tokens.push({ type: 'OPERATOR', value: '<=', position: start })
      pos += 2
      continue
    }
    if (ch === '>') {
      tokens.push({ type: 'OPERATOR', value: '>', position: start })
      pos++
      continue
    }
    if (ch === '<') {
      tokens.push({ type: 'OPERATOR', value: '<', position: start })
      pos++
      continue
    }
    if (ch === '=') {
      tokens.push({ type: 'OPERATOR', value: '=', position: start })
      pos++
      continue
    }
    if (ch === ':') {
      tokens.push({ type: 'OPERATOR', value: ':', position: start })
      pos++
      continue
    }

    // Quoted string
    if (ch === '"') {
      pos++ // skip opening quote
      let value = ''
      while (pos < input.length && charAt(pos) !== '"') {
        if (charAt(pos) === '\\' && pos + 1 < input.length) {
          pos++ // skip backslash
          value += charAt(pos)
        } else {
          value += charAt(pos)
        }
        pos++
      }
      if (pos >= input.length) {
        throw new LexerError('Unterminated string', start, pos - start)
      }
      pos++ // skip closing quote
      tokens.push({ type: 'STRING', value, position: start })
      continue
    }

    // Number (integer or decimal, optionally negative)
    if (/\d/.test(ch) || (ch === '-' && pos + 1 < input.length && /\d/.test(charAt(pos + 1)))) {
      let num = ch
      pos++
      let hasDot = false
      while (pos < input.length && /[\d.]/.test(charAt(pos))) {
        if (charAt(pos) === '.') {
          if (hasDot) break // Stop at second dot to reject "1.2.3"
          hasDot = true
        }
        num += charAt(pos)
        pos++
      }
      tokens.push({ type: 'NUMBER', value: num, position: start })
      continue
    }

    // Wildcard or unquoted identifier/field
    if (ch === '*' || /[a-zA-Z_]/.test(ch)) {
      let word = ''
      let hasWildcard = false
      while (pos < input.length && /[a-zA-Z0-9_.*-]/.test(charAt(pos)) && !OPERATORS.has(charAt(pos))) {
        // The `:` is an operator, so it stops identifier scanning
        if (charAt(pos) === ':') {
          break
        }
        if (charAt(pos) === '*') {
          hasWildcard = true
        }
        word += charAt(pos)
        pos++
      }

      // Check for keywords (case-sensitive for AND/OR/NOT, case-insensitive for stats/by)
      const keyword = KEYWORDS[word] || KEYWORDS[word.toLowerCase()]
      if (keyword && !hasWildcard) {
        // Only treat as keyword if it's AND/OR/NOT (uppercase) or stats/by (lowercase)
        if (
          word === 'AND' ||
          word === 'OR' ||
          word === 'NOT' ||
          word === 'EXISTS' ||
          word.toLowerCase() === 'stats' ||
          word.toLowerCase() === 'by'
        ) {
          tokens.push({ type: keyword, value: word, position: start })
          continue
        }
      }

      if (hasWildcard) {
        tokens.push({ type: 'WILDCARD', value: word, position: start })
      } else {
        tokens.push({ type: 'FIELD', value: word, position: start })
      }
      continue
    }

    throw new LexerError(`Unexpected character '${ch}'`, pos, 1)
  }

  tokens.push({ type: 'EOF', value: '', position: pos })
  return tokens
}
