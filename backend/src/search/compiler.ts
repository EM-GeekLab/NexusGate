import type {
  KqlQuery,
  KqlExpression,
  KqlValue,
  ComparisonOperator,
  AggregateExpression,
  CompiledQuery,
  FieldInfo,
  FieldType,
} from "./types";

// --- Field registry ---

interface FieldMapping {
  /** SQL column expression (using table alias "c" for completions, "p" for providers) */
  column: string;
  type: FieldType;
  description: string;
  /** Enum values for validation */
  values?: string[];
  /** Whether this field supports nested path access (JSONB) */
  nested?: boolean;
  /** The JSONB root column for nested fields */
  jsonbColumn?: string;
  /** The root key inside the JSONB column */
  jsonbRootKey?: string;
  /** Whether the JSONB root value is an array (key lives inside array elements) */
  jsonbRootIsArray?: boolean;
}

const COMPLETIONS_STATUS_VALUES = [
  "pending",
  "completed",
  "failed",
  "aborted",
  "cache_hit",
];

const API_FORMAT_VALUES = ["openai-chat", "openai-responses", "anthropic"];

const FIELD_REGISTRY: Record<string, FieldMapping> = {
  id: {
    column: "c.id",
    type: "number",
    description: "Completion record ID",
  },
  model: {
    column: "c.model",
    type: "text",
    description: "Model name",
  },
  status: {
    column: "c.status",
    type: "enum",
    description: "Request status",
    values: COMPLETIONS_STATUS_VALUES,
  },
  duration: {
    column: "c.duration",
    type: "number",
    description: "Total request duration (ms)",
  },
  ttft: {
    column: "c.ttft",
    type: "number",
    description: "Time to first token (ms)",
  },
  promptTokens: {
    column: "c.prompt_tokens",
    type: "number",
    description: "Input token count",
  },
  completionTokens: {
    column: "c.completion_tokens",
    type: "number",
    description: "Output token count",
  },
  apiKeyId: {
    column: "c.api_key_id",
    type: "number",
    description: "API key ID",
  },
  apiFormat: {
    column: "c.api_format",
    type: "enum",
    description: "API format used",
    values: API_FORMAT_VALUES,
  },
  rating: {
    column: "c.rating",
    type: "number",
    description: "User rating",
  },
  reqId: {
    column: "c.req_id",
    type: "text",
    description: "Request deduplication ID",
  },
  createdAt: {
    column: "c.created_at",
    type: "timestamp",
    description: "Request creation time",
  },
  provider: {
    column: "p.name",
    type: "text",
    description: "Provider name (via model join)",
  },
  // JSONB nested fields
  extraHeaders: {
    column: "c.prompt",
    type: "jsonb",
    description: "Extra headers passed with the request",
    nested: true,
    jsonbColumn: "c.prompt",
    jsonbRootKey: "extraHeaders",
  },
  extraBody: {
    column: "c.prompt",
    type: "jsonb",
    description: "Extra body parameters",
    nested: true,
    jsonbColumn: "c.prompt",
    jsonbRootKey: "extraBody",
  },
  toolCalls: {
    column: "c.completion",
    type: "jsonb",
    description: "Tool calls in the response",
    nested: true,
    jsonbColumn: "c.completion",
    jsonbRootKey: "tool_calls",
    jsonbRootIsArray: true,
  },
};

// Validate JSONB path segments to prevent SQL injection
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/**
 * Unwrap a double-encoded JSONB column.
 * The prompt/completion columns store data as JSONB strings (double-encoded),
 * so we need (#>> '{}')::jsonb to get the actual JSON object/array.
 */
function unwrapJsonb(column: string): string {
  return `(${column} #>> '{}')::jsonb`;
}

function validateJsonbPath(segments: string[], position?: number): void {
  for (const segment of segments) {
    if (!SAFE_PATH_SEGMENT.test(segment)) {
      throw new CompilerError(
        `Invalid JSONB path segment '${segment}'. Only alphanumeric characters, underscores, and hyphens are allowed.`,
        position,
      );
    }
  }
}

class CompilerError extends Error {
  constructor(
    message: string,
    public position?: number,
  ) {
    super(message);
    this.name = "CompilerError";
  }
}

// --- SQL Compiler ---

class SqlCompiler {
  private params: unknown[] = [];
  private paramIndex = 0;

  constructor(startParamIndex = 0) {
    this.paramIndex = startParamIndex;
  }

  addParam(value: unknown): string {
    this.paramIndex++;
    this.params.push(value);
    return `$${this.paramIndex}`;
  }

  /**
   * Resolve a dotted field name to its SQL representation and field mapping.
   * Handles both direct fields (e.g., "model") and nested JSONB paths (e.g., "extraHeaders.x-experiment").
   */
  private resolveField(fieldName: string): {
    sql: string;
    mapping: FieldMapping;
    isJsonbPath: boolean;
  } {
    const parts = fieldName.split(".");
    const [rootField] = parts;
    if (!rootField) {
      throw new CompilerError(`Empty field name`);
    }
    const mapping = FIELD_REGISTRY[rootField];

    if (!mapping) {
      throw new CompilerError(
        `Unknown field '${fieldName}'. Available fields: ${Object.keys(FIELD_REGISTRY).join(", ")}`,
      );
    }

    // Simple field (no dots)
    if (parts.length === 1) {
      return { sql: mapping.column, mapping, isJsonbPath: false };
    }

    // Nested JSONB path
    if (!mapping.nested || !mapping.jsonbColumn || !mapping.jsonbRootKey) {
      throw new CompilerError(
        `Field '${rootField}' does not support nested path access`,
      );
    }

    const pathSegments = parts.slice(1);
    validateJsonbPath(pathSegments);

    // Build JSONB path expression:
    // For extraHeaders.x-experiment: (c.prompt #>> '{}')::jsonb->'extraHeaders'->>'x-experiment'
    // For deeper paths: (c.prompt #>> '{}')::jsonb->'extraHeaders'->'nested'->>'key'
    const unwrapped = unwrapJsonb(mapping.jsonbColumn);
    let jsonbSql = `${unwrapped}->'${mapping.jsonbRootKey}'`;
    for (let i = 0; i < pathSegments.length - 1; i++) {
      jsonbSql += `->'${pathSegments[i]}'`;
    }
    jsonbSql += `->>'${pathSegments[pathSegments.length - 1]}'`;

    return { sql: jsonbSql, mapping, isJsonbPath: true };
  }

  compileExpression(expr: KqlExpression): string {
    switch (expr.type) {
      case "comparison":
        return this.compileComparison(expr);
      case "exists":
        return this.compileExists(expr.field);
      case "and":
        return `(${this.compileExpression(expr.left)} AND ${this.compileExpression(expr.right)})`;
      case "or":
        return `(${this.compileExpression(expr.left)} OR ${this.compileExpression(expr.right)})`;
      case "not":
        return `NOT (${this.compileExpression(expr.expression)})`;
      case "group":
        return `(${this.compileExpression(expr.expression)})`;
    }
  }

  private compileExists(fieldName: string): string {
    const parts = fieldName.split(".");
    const [rootField] = parts;
    if (!rootField) {
      throw new CompilerError(`Empty field name`);
    }
    const mapping = FIELD_REGISTRY[rootField];
    if (!mapping) {
      throw new CompilerError(
        `Unknown field '${fieldName}'. Available fields: ${Object.keys(FIELD_REGISTRY).join(", ")}`,
      );
    }

    // For JSONB root fields (e.g., "extraBody EXISTS")
    if (mapping.type === "jsonb" && mapping.jsonbColumn && mapping.jsonbRootKey) {
      const unwrapped = unwrapJsonb(mapping.jsonbColumn);

      // Array-rooted JSONB (e.g., toolCalls — completion is an array of messages)
      if (mapping.jsonbRootIsArray) {
        const safeUnwrapped = `CASE WHEN jsonb_typeof(${unwrapped}) = 'array' THEN ${unwrapped} ELSE '[]'::jsonb END`;
        if (parts.length === 1) {
          return `EXISTS (SELECT 1 FROM jsonb_array_elements(${safeUnwrapped}) _elem WHERE _elem->'${mapping.jsonbRootKey}' IS NOT NULL)`;
        }
        const pathSegments = parts.slice(1);
        validateJsonbPath(pathSegments);
        let pathSql = `_elem->'${mapping.jsonbRootKey}'`;
        for (let i = 0; i < pathSegments.length - 1; i++) {
          pathSql += `->'${pathSegments[i]}'`;
        }
        pathSql += `->>'${pathSegments[pathSegments.length - 1]}'`;
        return `EXISTS (SELECT 1 FROM jsonb_array_elements(${safeUnwrapped}) _elem WHERE ${pathSql} IS NOT NULL)`;
      }

      if (parts.length === 1) {
        return `${unwrapped}->'${mapping.jsonbRootKey}' IS NOT NULL`;
      }
      // Nested existence: extraHeaders.x-app EXISTS
      const pathSegments = parts.slice(1);
      validateJsonbPath(pathSegments);
      let jsonbSql = `${unwrapped}->'${mapping.jsonbRootKey}'`;
      for (let i = 0; i < pathSegments.length - 1; i++) {
        jsonbSql += `->'${pathSegments[i]}'`;
      }
      jsonbSql += `->>'${pathSegments[pathSegments.length - 1]}'`;
      return `${jsonbSql} IS NOT NULL`;
    }

    // For non-JSONB fields, EXISTS means IS NOT NULL
    return `${mapping.column} IS NOT NULL`;
  }

  /**
   * Compile a comparison on an array-rooted JSONB field.
   * Generates EXISTS (SELECT 1 FROM jsonb_array_elements(...) _msg, jsonb_array_elements(_msg->'key') _tc WHERE _tc->>'path' op $N)
   */
  private compileArrayJsonbComparison(
    expr: { field: string; operator: ComparisonOperator; value: KqlValue },
    mapping: FieldMapping,
    pathAfterRoot: string[],
  ): string {
    if (pathAfterRoot.length === 0) {
      throw new CompilerError(
        `Field '${expr.field}' requires a nested path (e.g., '${expr.field}.function.name')`,
      );
    }

    validateJsonbPath(pathAfterRoot);

    const unwrapped = unwrapJsonb(mapping.jsonbColumn!);

    // Build path from _tc element to the target field
    let pathSql = "_tc";
    for (let i = 0; i < pathAfterRoot.length - 1; i++) {
      pathSql += `->'${pathAfterRoot[i]}'`;
    }
    pathSql += `->>'${pathAfterRoot[pathAfterRoot.length - 1]}'`;

    // Build the comparison expression
    let comparison: string;
    if (expr.value.type === "wildcard") {
      const pattern = expr.value.pattern.replace(/\*/g, "%");
      const param = this.addParam(pattern);
      comparison = `${pathSql} ILIKE ${param}`;
    } else {
      const strValue =
        expr.value.type === "string" ? expr.value.value : String(expr.value.value);
      const param = this.addParam(strValue);
      if (expr.operator === ":" || expr.operator === "=") {
        comparison = `${pathSql} = ${param}`;
      } else if (expr.operator === "!=") {
        comparison = `${pathSql} != ${param}`;
      } else {
        comparison = `${pathSql} ${expr.operator} ${param}`;
      }
    }

    return `EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${unwrapped}) = 'array' THEN ${unwrapped} ELSE '[]'::jsonb END) _msg, jsonb_array_elements(CASE WHEN jsonb_typeof(_msg->'${mapping.jsonbRootKey}') = 'array' THEN _msg->'${mapping.jsonbRootKey}' ELSE '[]'::jsonb END) _tc WHERE ${comparison})`;
  }

  private compileComparison(expr: {
    field: string;
    operator: ComparisonOperator;
    value: KqlValue;
  }): string {
    // Check for array-rooted JSONB fields (e.g., toolCalls.function.name)
    const parts = expr.field.split(".");
    const rootField = parts[0];
    if (rootField) {
      const rootMapping = FIELD_REGISTRY[rootField];
      if (rootMapping?.jsonbRootIsArray) {
        return this.compileArrayJsonbComparison(expr, rootMapping, parts.slice(1));
      }
    }

    const { sql: fieldSql, mapping, isJsonbPath } = this.resolveField(
      expr.field,
    );

    // For JSONB paths, values are always text (extracted with ->>)
    if (isJsonbPath) {
      return this.compileJsonbComparison(fieldSql, expr.operator, expr.value);
    }

    switch (mapping.type) {
      case "text":
        return this.compileTextComparison(fieldSql, expr.operator, expr.value);
      case "number":
        return this.compileNumberComparison(
          fieldSql,
          expr.operator,
          expr.value,
        );
      case "enum":
        return this.compileEnumComparison(
          fieldSql,
          expr.operator,
          expr.value,
          mapping.values || [],
          expr.field,
        );
      case "timestamp":
        return this.compileTimestampComparison(
          fieldSql,
          expr.operator,
          expr.value,
        );
      case "jsonb":
        // Direct JSONB field reference without path — not directly queryable
        throw new CompilerError(
          `Field '${expr.field}' requires a nested path (e.g., '${expr.field}.key')`,
        );
    }
  }

  private compileTextComparison(
    fieldSql: string,
    operator: ComparisonOperator,
    value: KqlValue,
  ): string {
    if (value.type === "wildcard") {
      const pattern = value.pattern.replace(/\*/g, "%");
      const param = this.addParam(pattern);
      return `${fieldSql} ILIKE ${param}`;
    }

    const strValue = value.type === "string" ? value.value : String(value.value);
    const param = this.addParam(strValue);

    if (operator === ":" || operator === "=") {
      return `${fieldSql} = ${param}`;
    }
    if (operator === "!=") {
      return `${fieldSql} != ${param}`;
    }

    // Range operators on text fields — compare lexicographically
    return `${fieldSql} ${operator} ${param}`;
  }

  private compileNumberComparison(
    fieldSql: string,
    operator: ComparisonOperator,
    value: KqlValue,
  ): string {
    let numValue: number;
    if (value.type === "number") {
      numValue = value.value;
    } else if (value.type === "string") {
      numValue = Number(value.value);
      if (Number.isNaN(numValue)) {
        throw new CompilerError(
          `Expected numeric value for numeric field, got '${value.value}'`,
        );
      }
    } else {
      throw new CompilerError(
        `Wildcards are not supported for numeric fields`,
      );
    }

    const param = this.addParam(numValue);
    const sqlOp = operator === ":" ? "=" : operator;
    return `${fieldSql} ${sqlOp} ${param}`;
  }

  private compileEnumComparison(
    fieldSql: string,
    operator: ComparisonOperator,
    value: KqlValue,
    validValues: string[],
    fieldName: string,
  ): string {
    if (value.type === "wildcard") {
      const pattern = value.pattern.replace(/\*/g, "%");
      const param = this.addParam(pattern);
      return `${fieldSql}::text ILIKE ${param}`;
    }

    const strValue = value.type === "string" ? value.value : String(value.value);

    if (validValues.length > 0 && !validValues.includes(strValue)) {
      throw new CompilerError(
        `Invalid value '${strValue}' for field '${fieldName}'. Valid values: ${validValues.join(", ")}`,
      );
    }

    const param = this.addParam(strValue);
    if (operator === ":" || operator === "=") {
      return `${fieldSql} = ${param}`;
    }
    if (operator === "!=") {
      return `${fieldSql} != ${param}`;
    }

    throw new CompilerError(
      `Operator '${operator}' is not supported for enum field '${fieldName}'`,
    );
  }

  private compileTimestampComparison(
    fieldSql: string,
    operator: ComparisonOperator,
    value: KqlValue,
  ): string {
    if (value.type === "wildcard") {
      throw new CompilerError(`Wildcards are not supported for timestamp fields`);
    }

    const strValue = value.type === "string" ? value.value : String(value.value);
    const param = this.addParam(strValue);
    const sqlOp = operator === ":" ? "=" : operator;
    return `${fieldSql} ${sqlOp} ${param}::timestamp`;
  }

  private compileJsonbComparison(
    fieldSql: string,
    operator: ComparisonOperator,
    value: KqlValue,
  ): string {
    // JSONB ->> returns text, so all comparisons are text-based
    if (value.type === "wildcard") {
      const pattern = value.pattern.replace(/\*/g, "%");
      const param = this.addParam(pattern);
      return `${fieldSql} ILIKE ${param}`;
    }

    const strValue = value.type === "string" ? value.value : String(value.value);
    const param = this.addParam(strValue);

    if (operator === ":" || operator === "=") {
      return `${fieldSql} = ${param}`;
    }
    if (operator === "!=") {
      return `(${fieldSql} IS NULL OR ${fieldSql} != ${param})`;
    }

    // For numeric comparisons on JSONB text, cast to numeric
    if (value.type === "number") {
      return `(${fieldSql})::numeric ${operator} ${param}::numeric`;
    }

    return `${fieldSql} ${operator} ${param}`;
  }

  compileAggregation(agg: {
    functions: AggregateExpression[];
    groupBy?: string[];
  }): {
    selectExpressions: { sql: string; alias: string }[];
    groupByColumn?: string;
    groupByField?: string;
  } {
    const selectExpressions = agg.functions.map((fn) =>
      this.compileAggregateFunction(fn),
    );

    let groupByColumn: string | undefined;
    let groupByField: string | undefined;

    if (agg.groupBy && agg.groupBy.length > 0) {
      if (agg.groupBy.length > 1) {
        throw new CompilerError("Only a single GROUP BY field is supported");
      }
      const [field] = agg.groupBy;
      if (!field) {
        throw new CompilerError("Empty GROUP BY field");
      }
      const { sql: fieldSql } = this.resolveField(field);
      groupByColumn = fieldSql;
      groupByField = field;
    }

    return { selectExpressions, groupByColumn, groupByField };
  }

  private compileAggregateFunction(fn: AggregateExpression): {
    sql: string;
    alias: string;
  } {
    if (fn.fn === "count") {
      return { sql: "COUNT(*)", alias: "count" };
    }

    if (!fn.field) {
      throw new CompilerError(`${fn.fn}() requires a field argument`);
    }

    const { sql: fieldSql } = this.resolveField(fn.field);

    switch (fn.fn) {
      case "avg":
        return {
          sql: `AVG(${fieldSql})`,
          alias: `avg_${fn.field}`,
        };
      case "sum":
        return {
          sql: `SUM(${fieldSql})`,
          alias: `sum_${fn.field}`,
        };
      case "min":
        return {
          sql: `MIN(${fieldSql})`,
          alias: `min_${fn.field}`,
        };
      case "max":
        return {
          sql: `MAX(${fieldSql})`,
          alias: `max_${fn.field}`,
        };
      case "p50":
        return {
          sql: `percentile_cont(0.50) WITHIN GROUP (ORDER BY ${fieldSql})`,
          alias: `p50_${fn.field}`,
        };
      case "p95":
        return {
          sql: `percentile_cont(0.95) WITHIN GROUP (ORDER BY ${fieldSql})`,
          alias: `p95_${fn.field}`,
        };
      case "p99":
        return {
          sql: `percentile_cont(0.99) WITHIN GROUP (ORDER BY ${fieldSql})`,
          alias: `p99_${fn.field}`,
        };
    }
  }

  getParams(): unknown[] {
    return this.params;
  }

  getParamIndex(): number {
    return this.paramIndex;
  }
}

// --- Helpers ---

/**
 * Check if a KQL expression references a specific field name.
 */
function expressionReferencesField(
  expr: KqlExpression | undefined,
  fieldName: string,
): boolean {
  if (!expr) {
    return false;
  }
  switch (expr.type) {
    case "comparison":
    case "exists":
      return expr.field === fieldName || expr.field.startsWith(`${fieldName}.`);
    case "and":
    case "or":
      return (
        expressionReferencesField(expr.left, fieldName) ||
        expressionReferencesField(expr.right, fieldName)
      );
    case "not":
      return expressionReferencesField(expr.expression, fieldName);
    case "group":
      return expressionReferencesField(expr.expression, fieldName);
  }
}

// --- Public API ---

export interface CompileOptions {
  /** Time range filter to add to the WHERE clause */
  timeRange?: { from: Date; to: Date };
  /** Starting parameter index (for combining with other parameterized queries) */
  startParamIndex?: number;
}

export function compileSearch(
  query: KqlQuery,
  options?: CompileOptions,
): CompiledQuery {
  const compiler = new SqlCompiler(options?.startParamIndex ?? 0);
  const parts: string[] = [];

  // Always exclude deleted records
  parts.push("c.deleted = false");

  // Add time range filter only if the user's query doesn't already filter on createdAt
  const hasExplicitTimeFilter = expressionReferencesField(
    query.filter,
    "createdAt",
  );
  if (options?.timeRange && !hasExplicitTimeFilter) {
    const fromParam = compiler.addParam(options.timeRange.from);
    const toParam = compiler.addParam(options.timeRange.to);
    parts.push(`c.created_at >= ${fromParam}`);
    parts.push(`c.created_at <= ${toParam}`);
  }

  // Add KQL filter expression
  if (query.filter) {
    parts.push(compiler.compileExpression(query.filter));
  }

  const whereClause = parts.join(" AND ");

  // Compile aggregation if present
  let aggregation: CompiledQuery["aggregation"];
  if (query.aggregation) {
    aggregation = compiler.compileAggregation(query.aggregation);
  }

  return {
    whereClause,
    params: compiler.getParams(),
    aggregation,
  };
}

/**
 * Get the list of searchable fields for autocomplete.
 */
export function getSearchableFields(): FieldInfo[] {
  return Object.entries(FIELD_REGISTRY).map(([name, mapping]) => ({
    name,
    type: mapping.type,
    description: mapping.description,
    values: mapping.values,
    nested: mapping.nested,
  }));
}

