import { LexerError, tokenize } from './lexer'
import type {
  AggregateExpression,
  AggregateFunction,
  ComparisonOperator,
  KqlExpression,
  KqlQuery,
  KqlValue,
  ParseResult,
  Token,
  TokenType,
} from './types'

const AGGREGATE_FUNCTIONS = new Set<AggregateFunction>(['count', 'avg', 'sum', 'min', 'max', 'p50', 'p95', 'p99'])

class Parser {
  private tokens: Token[]
  private pos: number

  constructor(tokens: Token[]) {
    this.tokens = tokens
    this.pos = 0
  }

  private current(): Token {
    // pos is always valid (lexer ends with EOF token)
    const token = this.tokens[this.pos]
    if (!token) {
      throw new Error('Unexpected end of token stream')
    }
    return token
  }

  private peek(type: TokenType): boolean {
    return this.current().type === type
  }

  private advance(): Token {
    const token = this.current()
    if (token.type !== 'EOF') {
      this.pos++
    }
    return token
  }

  private expect(type: TokenType): Token {
    const token = this.current()
    if (token.type !== type) {
      throw new ParserError(
        `Expected ${type} but found ${token.type}${token.value ? ` '${token.value}'` : ''}`,
        token.position,
        token.value.length || 1,
      )
    }
    return this.advance()
  }

  // query = filter_expr (PIPE "stats" agg_list ("by" field_list)?)?
  parse(): KqlQuery {
    const query: KqlQuery = {}

    // Parse filter expression if present (not starting with pipe or at EOF)
    if (!this.peek('EOF') && !this.peek('PIPE')) {
      query.filter = this.parseOrExpr()
    }

    // Parse aggregation pipeline if present
    if (this.peek('PIPE')) {
      this.advance() // consume PIPE
      this.expect('STATS')

      const functions = this.parseAggList()
      let groupBy: string[] | undefined

      if (this.peek('BY')) {
        this.advance() // consume BY
        groupBy = this.parseFieldList()
      }

      query.aggregation = { functions, groupBy }
    }

    if (!this.peek('EOF')) {
      const token = this.current()
      throw new ParserError(`Unexpected token '${token.value}'`, token.position, token.value.length || 1)
    }

    return query
  }

  // or_expr = and_expr ("OR" and_expr)*
  private parseOrExpr(): KqlExpression {
    let left = this.parseAndExpr()

    while (this.peek('OR')) {
      this.advance() // consume OR
      const right = this.parseAndExpr()
      left = { type: 'or', left, right }
    }

    return left
  }

  // and_expr = not_expr ("AND" not_expr)*
  private parseAndExpr(): KqlExpression {
    let left = this.parseNotExpr()

    while (this.peek('AND')) {
      this.advance() // consume AND
      const right = this.parseNotExpr()
      left = { type: 'and', left, right }
    }

    return left
  }

  // not_expr = "NOT" not_expr | primary
  private parseNotExpr(): KqlExpression {
    if (this.peek('NOT')) {
      this.advance() // consume NOT
      const expression = this.parseNotExpr()
      return { type: 'not', expression }
    }

    return this.parsePrimary()
  }

  // primary = LPAREN or_expr RPAREN | comparison
  private parsePrimary(): KqlExpression {
    if (this.peek('LPAREN')) {
      this.advance() // consume LPAREN
      const expression = this.parseOrExpr()
      this.expect('RPAREN')
      return { type: 'group', expression }
    }

    return this.parseComparison()
  }

  // comparison = FIELD (operator value | "EXISTS")
  private parseComparison(): KqlExpression {
    const fieldToken = this.current()

    if (fieldToken.type !== 'FIELD') {
      throw new ParserError(
        `Expected field name but found ${fieldToken.type}${fieldToken.value ? ` '${fieldToken.value}'` : ''}`,
        fieldToken.position,
        fieldToken.value.length || 1,
      )
    }
    this.advance() // consume FIELD

    // Check for EXISTS keyword (e.g., "extraBody EXISTS")
    if (this.peek('EXISTS')) {
      this.advance() // consume EXISTS
      return { type: 'exists', field: fieldToken.value }
    }

    const opToken = this.current()
    if (opToken.type !== 'OPERATOR') {
      throw new ParserError(
        `Expected operator after field '${fieldToken.value}'`,
        opToken.position,
        opToken.value.length || 1,
      )
    }
    const operator = opToken.value as ComparisonOperator
    this.advance() // consume OPERATOR

    const value = this.parseValue()

    return {
      type: 'comparison',
      field: fieldToken.value,
      operator,
      value,
    }
  }

  // value = STRING | NUMBER | WILDCARD | FIELD (unquoted string treated as string value)
  private parseValue(): KqlValue {
    const token = this.current()

    if (token.type === 'STRING') {
      this.advance()
      return { type: 'string', value: token.value }
    }

    if (token.type === 'NUMBER') {
      this.advance()
      return { type: 'number', value: Number(token.value) }
    }

    if (token.type === 'WILDCARD') {
      this.advance()
      return { type: 'wildcard', pattern: token.value }
    }

    // Allow unquoted identifiers as string values (e.g., `status: completed`)
    if (token.type === 'FIELD') {
      this.advance()
      return { type: 'string', value: token.value }
    }

    throw new ParserError(`Expected value after operator`, token.position, token.value.length || 1)
  }

  // agg_list = agg_fn ("," agg_fn)*
  private parseAggList(): AggregateExpression[] {
    const functions: AggregateExpression[] = []
    functions.push(this.parseAggFn())

    while (this.peek('COMMA')) {
      this.advance() // consume COMMA
      functions.push(this.parseAggFn())
    }

    return functions
  }

  // agg_fn = FIELD "(" FIELD? ")"
  private parseAggFn(): AggregateExpression {
    const fnToken = this.current()
    if (fnToken.type !== 'FIELD') {
      throw new ParserError(`Expected aggregate function name`, fnToken.position, fnToken.value.length || 1)
    }

    const fnName = fnToken.value.toLowerCase()
    if (!AGGREGATE_FUNCTIONS.has(fnName as AggregateFunction)) {
      throw new ParserError(
        `Unknown aggregate function '${fnToken.value}'. Supported: ${[...AGGREGATE_FUNCTIONS].join(', ')}`,
        fnToken.position,
        fnToken.value.length,
      )
    }
    this.advance() // consume function name

    this.expect('LPAREN')

    let field: string | undefined
    if (!this.peek('RPAREN')) {
      const fieldToken = this.expect('FIELD')
      field = fieldToken.value
    }

    this.expect('RPAREN')

    // Validate count() has no field, others require a field
    if (fnName === 'count' && field) {
      throw new ParserError(`count() does not take a field argument`, fnToken.position, fnToken.value.length)
    }
    if (fnName !== 'count' && !field) {
      throw new ParserError(`${fnName}() requires a field argument`, fnToken.position, fnToken.value.length)
    }

    return { fn: fnName as AggregateFunction, field }
  }

  // field_list = FIELD ("," FIELD)*
  private parseFieldList(): string[] {
    const fields: string[] = []
    fields.push(this.expect('FIELD').value)

    while (this.peek('COMMA')) {
      this.advance() // consume COMMA
      fields.push(this.expect('FIELD').value)
    }

    return fields
  }
}

class ParserError extends Error {
  constructor(
    message: string,
    public position: number,
    public length: number,
  ) {
    super(message)
    this.name = 'ParserError'
  }
}

export function parseKql(input: string): ParseResult {
  try {
    const trimmed = input.trim()
    if (trimmed === '') {
      return { success: true, query: {} }
    }

    const tokens = tokenize(trimmed)
    const parser = new Parser(tokens)
    const query = parser.parse()
    return { success: true, query }
  } catch (err) {
    if (err instanceof ParserError || err instanceof LexerError) {
      return {
        success: false,
        error: {
          message: err.message,
          position: err.position,
          length: err.length,
        },
      }
    }
    throw err
  }
}
