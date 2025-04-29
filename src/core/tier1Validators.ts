import { ValidationResult } from './types.js';
import jsonld from 'jsonld';
import { validateJsonAgainstSchema, VERIFIABLE_CREDENTIAL_SCHEMA_URL } from './utils.js';

/**
 * Validates if the input is a valid JSON
 * @param input - String input to validate as JSON
 * @returns ValidationResult with JSON validation results
 */
export function validateJSON(input: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: {}
  };

  try {
    const parsed = JSON.parse(input);
    result.metadata = { parsedJSON: parsed };
  } catch (error) {
    result.valid = false;
    if (error instanceof Error) {
      result.errors.push({
        code: 'INVALID_JSON',
        message: `Invalid JSON format: ${error.message}`
      });
    } else {
      result.errors.push({
        code: 'INVALID_JSON',
        message: 'Invalid JSON format'
      });
    }
  }

  return result;
}


/**
 * Validates if a parsed JSON object conforms to W3C Verifiable Credential structure
 * @param credential - Object to validate as Verifiable Credential
 * @returns Promise<ValidationResult> with validation results
 */
export async function validateVerifiableCredential(credential: any): Promise<ValidationResult> {
  // Validate against the W3C VC schema
  return await validateJsonAgainstSchema(credential, VERIFIABLE_CREDENTIAL_SCHEMA_URL);
}


/**
 * Validates if a parsed JSON object is valid JSON-LD
 * @param credential - Object to validate as JSON-LD
 * @returns Promise<ValidationResult> with JSON-LD validation results
 */
export async function validateJSONLD(credential: any): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: {}
  };

  try {
    // Configure options for jsonld.expand
    const expandOptions: any = {
      safe: true // Use safe mode to avoid code execution in JSON-LD scripts
    };

    // Try to expand the JSON-LD document
    await jsonld.expand(credential, expandOptions);

  } catch (error) {
    result.valid = false;
    result.errors.push({
      code: 'INVALID_JSONLD',
      message: 'Invalid JSON-LD format',
      error: error // Always include the actual error object
    });
  }

  return result;
}
