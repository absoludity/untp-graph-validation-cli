import fs from 'fs';
import chalk from 'chalk';
import { ValidationResult } from './types.js';
import { validateUNTPFile } from './tier1Validators.js';
import { getValidator } from './ajv.js';

export const VERIFIABLE_CREDENTIAL_SCHEMA_URL = 'https://github.com/w3c/vc-data-model/raw/refs/heads/main/schema/verifiable-credential/verifiable-credential-schema.json';

/**
 * Validation options
 */
export interface ValidationOptions {
  // Empty for now, but keeping the interface for future extensibility
}

/**
 * Validates a JSON object against a JSON schema
 * @param jsonData - The JSON object to validate
 * @param schemaUrl - URL of the JSON schema to validate against
 * @returns Promise<ValidationResult> with schema validation results
 */
export async function validateJsonAgainstSchema(jsonData: any, schemaUrl: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: {
      schemaUrl
    }
  };

  try {
    // Get the validator from our ajv module
    const validate = await getValidator(schemaUrl);

    // Validate against the schema (synchronous function that returns boolean)
    const isValid = validate(jsonData);

    if (isValid) {
      return result;
    } else {
      // Validation failed
      result.valid = false;

      // Check if there are validation errors
      if (validate.errors) {
        // Convert Ajv errors to our format
        for (const ajvError of validate.errors) {
          result.errors.push({
            code: 'SCHEMA_VALIDATION_ERROR',
            message: `${ajvError.instancePath} ${ajvError.message}`,
            path: ajvError.instancePath,
            error: ajvError
          });
        }
      } else {
        // Handle case where validation failed but no specific errors
        result.errors.push({
          code: 'SCHEMA_VALIDATION_ERROR',
          message: 'Schema validation failed without specific errors'
        });
      }
    }
  } catch (error) {
    result.valid = false;

    result.errors.push({
      code: 'SCHEMA_VALIDATION_FAILED',
      message: `Failed to validate against schema: ${error instanceof Error ? error.message : String(error)}`
    });
  }

  return result;
}


/**
 * Extracts the DPP version from a credential's context
 * @param credential - The credential object
 * @returns The extracted version or null if not found
 */
export function extractDPPVersion(credential: any): string | null {
  if (!credential['@context'] || !Array.isArray(credential['@context'])) {
    return null;
  }

  // Look for the DPP context URL
  const dppContextRegex = /https:\/\/test\.uncefact\.org\/vocabulary\/untp\/dpp\/([^/]+)\//;

  for (const contextUrl of credential['@context']) {
    if (typeof contextUrl === 'string') {
      const match = contextUrl.match(dppContextRegex);
      if (match && match[1]) {
        return match[1]; // Return the captured version
      }
    }
  }

  return null;
}

/**
 * Gets the schema URL for a credential based on its version
 * @param credential - The credential object
 * @returns The schema URL or null if version couldn't be extracted
 */
export function getSchemaUrlForCredential(credential: any): string | null {
  const version = extractDPPVersion(credential);
  if (!version) {
    return null;
  }

  return `https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-${version}.json`;
}

/**
 * Validates multiple UNTP credential files and their relationships
 * @param filePaths - Array of paths to files to validate
 * @returns Promise<Array<{ filePath: string; result: ValidationResult }>> with validation results
 */
export async function validateUNTPCredentialsFromPaths(
  filePaths: string[]
): Promise<Array<{ filePath: string; result: ValidationResult }>> {
  // Read and validate all files
  const fileResults = await Promise.all(filePaths.map(async filePath => {
    const result = await validateUNTPFileFromPath(filePath);
    return { filePath, result };
  }));

  // Here we could add cross-file validation logic using the parsed content
  // that's now available in each result's metadata.parsedJSON

  return fileResults;
}

/**
 * Reads a file and validates its content as a UNTP credential
 * @param filePath - Path to the file to validate
 * @returns Promise<ValidationResult> with file validation results
 */
export async function validateUNTPFileFromPath(filePath: string): Promise<ValidationResult> {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        errors: [{
          code: 'FILE_NOT_FOUND',
          message: `File not found: ${filePath}`
        }],
        warnings: [],
        metadata: { filePath }
      };
    }

    // Read file content
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Validate file content
    const result = await validateUNTPFile(fileContent);

    // Add file path to metadata
    result.metadata = {
      ...result.metadata,
      filePath
    };

    return result;
  } catch (error) {
    // Handle any unexpected errors
    return {
      valid: false,
      errors: [{
        code: 'FILE_READ_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error reading file'
      }],
      warnings: [],
      metadata: { filePath }
    };
  }
}
