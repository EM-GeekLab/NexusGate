// KQL (Kibana Query Language) AST types for advanced meta search

// --- Token types (used by lexer) ---

export type TokenType =
  | 'FIELD'
  | 'STRING'
  | 'NUMBER'
  | 'WILDCARD'
  | 'OPERATOR'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'PIPE'
  | 'STATS'
  | 'BY'
  | 'COMMA'
  | 'EXISTS'
  | 'EOF'

export interface Token {
  type: TokenType
  value: string
  position: number
}

// --- AST node types ---

export type KqlValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'wildcard'; pattern: string }

export type ComparisonOperator = ':' | '=' | '!=' | '>' | '>=' | '<' | '<='

export type KqlExpression =
  | {
      type: 'comparison'
      field: string
      operator: ComparisonOperator
      value: KqlValue
    }
  | { type: 'and'; left: KqlExpression; right: KqlExpression }
  | { type: 'or'; left: KqlExpression; right: KqlExpression }
  | { type: 'not'; expression: KqlExpression }
  | { type: 'group'; expression: KqlExpression }
  | { type: 'exists'; field: string }

export type AggregateFunction = 'count' | 'avg' | 'sum' | 'min' | 'max' | 'p50' | 'p95' | 'p99'

export interface AggregateExpression {
  fn: AggregateFunction
  field?: string // undefined for count()
}

export interface KqlAggregation {
  functions: AggregateExpression[]
  groupBy?: string[]
}

export interface KqlQuery {
  filter?: KqlExpression
  aggregation?: KqlAggregation
}

// --- Parse result types ---

export interface ParseError {
  message: string
  position: number
  length: number
}

export type ParseResult = { success: true; query: KqlQuery } | { success: false; error: ParseError }
