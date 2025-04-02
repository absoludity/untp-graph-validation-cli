import { ValidationResult, CredentialType } from './types.js';
import { getValidator } from './ajv.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { n3reasoner } from 'eyereasoner';

export const VERIFIABLE_CREDENTIAL_SCHEMA_URL = 'https://github.com/w3c/vc-data-model/raw/refs/heads/main/schema/verifiable-credential/verifiable-credential-schema.json';

/**
 * Gets the UNTP credential type from a parsed credential
 * @param credential - The credential object
 * @returns The CredentialType enum value or undefined if not a recognized UNTP type
 */
export function getCredentialType(credential: any): CredentialType | undefined {
  if (!credential.type || !Array.isArray(credential.type)) {
    return undefined;
  }

  // Get all possible credential types from the enum
  const credentialTypes = Object.values(CredentialType);
  
  // Find the first matching credential type in the credential's type array
  for (const type of credential.type) {
    if (credentialTypes.includes(type)) {
      return type as CredentialType;
    }
  }

  return undefined;
}

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
 * Gets the absolute path to a query file
 * @param queryName - Name of the query file without extension
 * @returns Absolute path to the query file
 */
export function getQueryFilePath(queryName: string): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const queryPath = path.join(__dirname, 'queries', `${queryName}.n3`);
  
  if (!fs.existsSync(queryPath)) {
    throw new Error(`Query file not found: ${queryName}.n3`);
  }
  
  return queryPath;
}

/**
 * Options for executing an N3 query
 */
export interface QueryExecutionOptions {
  /** Output only string results from log:outputString */
  outputStrings?: boolean;
  /** Pass only new derived triples to the output */
  passOnlyNew?: boolean;
  /** Disable proof explanation */
  nope?: boolean;
}

/**
 * Executes an N3 query against an RDF graph using EYE reasoner
 * @param queryName - Name of the query file without extension
 * @param graphFile - Path to the RDF graph file
 * @param options - Query execution options
 * @returns Promise with the query results
 */
export async function executeQuery(
  queryName: string, 
  graphFile: string,
  options: QueryExecutionOptions = {}
): Promise<string> {
  const queryFile = getQueryFilePath(queryName);
  
  // Read the query and graph files
  const queryData = fs.readFileSync(queryFile, 'utf8');
  const graphData = fs.readFileSync(graphFile, 'utf8');
  
  // Prepare the reasoner options
  const reasonerOptions = {
    data: [graphData],
    query: [queryData],
    pass_only_new: options.passOnlyNew,
    strings: options.outputStrings,
    nope: options.nope
  };
  
  try {
    // Execute the query using the n3reasoner
    const result = await n3reasoner(reasonerOptions);
    return result;
  } catch (error) {
    throw new Error(`Error executing EYE reasoner: ${error instanceof Error ? error.message : String(error)}`);
  }
}
