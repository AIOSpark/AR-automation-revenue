// AIOSpark JSON Schema Validator (Layer 30)
// Lightweight schema validator for LLM structured output.
// Supports a subset of JSON Schema sufficient for agent output validation.

export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[];
  title?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JSONSchema;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  minItems?: number;
  maxItems?: number;
  [key: string]: unknown;
}

export interface ValidationError {
  path: string;
  message: string;
  value: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function getType(value: unknown): JSONSchemaType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string'; // fallback
}

function matchesType(value: unknown, type: JSONSchemaType | JSONSchemaType[]): boolean {
  const types = Array.isArray(type) ? type : [type];
  const actualType = getType(value);
  return types.includes(actualType);
}

export function validateJSONSchema(
  value: unknown,
  schema: JSONSchema,
  path: string = ''
): ValidationResult {
  const errors: ValidationError[] = [];

  // Type check
  if (schema.type !== undefined) {
    if (!matchesType(value, schema.type)) {
      errors.push({
        path: path || 'root',
        message: `Expected type ${Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type}, got ${getType(value)}`,
        value,
      });
      return { valid: false, errors };
    }
  }

  // Enum check
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push({
      path: path || 'root',
      message: `Value must be one of: ${schema.enum.join(', ')}`,
      value,
    });
    return { valid: false, errors };
  }

  // Const check
  if (schema.const !== undefined && value !== schema.const) {
    errors.push({
      path: path || 'root',
      message: `Value must be exactly: ${JSON.stringify(schema.const)}`,
      value,
    });
    return { valid: false, errors };
  }

  // Numeric constraints
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path: path || 'root',
        message: `Value must be >= ${schema.minimum}`,
        value,
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path: path || 'root',
        message: `Value must be <= ${schema.maximum}`,
        value,
      });
    }
  }

  // String constraints
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path: path || 'root',
        message: `String length must be >= ${schema.minLength}`,
        value,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path: path || 'root',
        message: `String length must be <= ${schema.maxLength}`,
        value,
      });
    }
    if (schema.pattern !== undefined) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          path: path || 'root',
          message: `String does not match pattern: ${schema.pattern}`,
          value,
        });
      }
    }
  }

  // Array constraints
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path: path || 'root',
        message: `Array must have at least ${schema.minItems} items`,
        value,
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        path: path || 'root',
        message: `Array must have at most ${schema.maxItems} items`,
        value,
      });
    }
    if (schema.items) {
      value.forEach((item, index) => {
        const itemResult = validateJSONSchema(item, schema.items as JSONSchema, `${path}[${index}]`);
        errors.push(...itemResult.errors);
      });
    }
  }

  // Object constraints
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    // Required properties
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in obj)) {
          errors.push({
            path: path || 'root',
            message: `Required property '${req}' is missing`,
            value: obj,
          });
        }
      }
    }

    // Property validation
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const propResult = validateJSONSchema(obj[key], propSchema as JSONSchema, `${path}.${key}`);
          errors.push(...propResult.errors);
        }
      }
    }

    // Additional properties
    if (schema.additionalProperties === false) {
      const allowedKeys = schema.properties ? Object.keys(schema.properties) : [];
      for (const key of Object.keys(obj)) {
        if (!allowedKeys.includes(key)) {
          errors.push({
            path: `${path}.${key}`,
            message: `Additional property '${key}' is not allowed`,
            value: obj[key],
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Extract a JSON payload from an LLM response.
 *
 * Models sometimes wrap JSON in markdown code fences or add a short preamble
 * even when instructed not to. Extract the JSON payload before validating so
 * formatting differences are not mistaken for schema failures.
 */
function extractJSON(input: unknown): string {
  const text = typeof input === 'string' ? input : input == null ? '' : JSON.stringify(input);
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Fall through to bracket extraction.
  }

  const firstObject = trimmed.indexOf('{');
  const firstArray = trimmed.indexOf('[');
  let start = -1;
  if (firstObject === -1) start = firstArray;
  else if (firstArray === -1) start = firstObject;
  else start = Math.min(firstObject, firstArray);

  if (start === -1) return trimmed;

  const openChar = trimmed[start];
  const closeChar = openChar === '{' ? '}' : ']';
  const end = trimmed.lastIndexOf(closeChar);
  if (end <= start) return trimmed;

  return trimmed.slice(start, end + 1);
}

/**
 * Parse and validate JSON from an LLM response.
 * Throws if the JSON is invalid or doesn't match the schema.
 */
export function parseAndValidateJSON<T = unknown>(
  text: string,
  schema: JSONSchema
): { success: true; data: T } | { success: false; errors: ValidationError[] } {
  let parsed: unknown;
  const candidate = extractJSON(text);
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    return {
      success: false,
      errors: [
        {
          path: 'root',
          message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
          value: text,
        },
      ],
    };
  }

  const result = validateJSONSchema(parsed, schema);
  if (!result.valid) {
    return { success: false, errors: result.errors };
  }

  return { success: true, data: parsed as T };
}
