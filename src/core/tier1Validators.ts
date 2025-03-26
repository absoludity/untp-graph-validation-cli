import { UNTPCredential, ValidationResult, ValidationError, ValidationWarning } from './types.js';
import jsonld from 'jsonld';
import chalk from 'chalk';
import { extractDPPVersion, getSchemaUrlForCredential, validateJsonAgainstSchema } from './utils.js';

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
 * Validates if a parsed JSON object conforms to UNTP credential structure using JSON Schema
 * @param credential - Object to validate as UNTP credential
 * @returns Promise<ValidationResult> with UNTP validation results
 */
export async function validateUNTPCredential(credential: any): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: {
      credentialType: credential.type?.join(', ') || 'Not specified',
      issuer: credential.issuer?.name || credential.issuer?.id || 'Not specified'
    }
  };

  // Get schema URL
  const schemaUrl = getSchemaUrlForCredential(credential);
  if (!schemaUrl) {
    result.warnings.push({
      code: 'SCHEMA_NOT_FOUND',
      message: 'Could not determine schema URL from credential context'
    });
  } else {
    // Validate against the schema
    const schemaResult = await validateJsonAgainstSchema(credential, schemaUrl);
    
    // Merge the results
    result.valid = schemaResult.valid;
    result.errors = [...result.errors, ...schemaResult.errors];
    result.warnings = [...result.warnings, ...schemaResult.warnings];
  }

  return result;
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

/**
 * Validates a file containing a UNTP credential
 * @param fileContent - String content of the file to validate
 * @returns Promise<ValidationResult> with combined validation results
 */
export async function validateUNTPFile(fileContent: string): Promise<ValidationResult> {
  // First validate JSON
  const jsonResult = validateJSON(fileContent);

  // If JSON is invalid, return early
  if (!jsonResult.valid) {
    return jsonResult;
  }

  // Then validate JSON-LD
  const parsedJSON = jsonResult.metadata?.parsedJSON;
  const jsonldResult = await validateJSONLD(parsedJSON);

  // If JSON-LD is invalid, return with combined results
  if (!jsonldResult.valid) {
    return {
      valid: false,
      errors: [...jsonResult.errors, ...jsonldResult.errors],
      warnings: [...jsonResult.warnings, ...jsonldResult.warnings],
      metadata: {
        ...jsonResult.metadata,
        validationSteps: {
          jsonValid: true,
          jsonldValid: false,
          untpStructureValid: false
        }
      }
    };
  }

  // Then validate UNTP structure
  const untpResult = await validateUNTPCredential(parsedJSON);

  // Combine metadata, ensuring parsedJSON is preserved
  untpResult.metadata = {
    ...jsonResult.metadata, // This contains parsedJSON
    ...untpResult.metadata,
    fileSize: fileContent.length,
    validationSteps: {
      jsonValid: true,
      jsonldValid: true,
      untpStructureValid: untpResult.valid
    }
  };

  return untpResult;
}

