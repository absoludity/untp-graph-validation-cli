import { ValidationResult, CredentialType } from './types.js';
import { getValidator } from './ajv.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { n3reasoner } from 'eyereasoner';
import { Parser, Writer, Quad, DataFactory } from 'n3';
import jsonld from 'jsonld';

const { namedNode, quad } = DataFactory;

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
 * Converts parsed JSON-LD data to N-Quads
 * @param jsonData - The parsed JSON-LD data
 * @param baseUri - Optional base URI for the data
 * @param useNamedGraphs - Whether to store quads in named graphs (defaults to false)
 * @returns Promise with the parsed quads
 */
export async function parsedDataToNQuads(
  jsonData: any,
  baseUri?: string,
  useNamedGraphs: boolean = false
): Promise<Quad[]> {
  // Get the base URI from the credential ID if available
  const uri = baseUri || jsonData.id || 'urn:unnamed';
  const graphName = namedNode(uri);

  // Convert JSON-LD to N-Quads (RDF format) using jsonld.js
  const nquads = await jsonld.toRDF(jsonData, {
    format: 'application/n-quads'
  });

  const nquadsString = nquads.toString();
  const parser = new Parser({ format: 'N-Quads' });
  const quads = parser.parse(nquadsString);

  // If using named graphs, set each quad's fourth element to the graph name
  if (useNamedGraphs) {
    return quads.map(q => quad(q.subject, q.predicate, q.object, graphName));
  }

  // Otherwise return the quads as-is
  return quads;
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
 * @param quads - Array of quads representing the RDF graph
 * @param options - Query execution options
 * @returns Promise with the query results as quads
 */
export async function executeQuery(
  queryName: string,
  quads: Quad[],
  options: QueryExecutionOptions = {}
): Promise<Quad[]> {
  const queryFile = getQueryFilePath(queryName);

  // Read the query file
  const queryContent = fs.readFileSync(queryFile, 'utf8');

  // Serialize quads to string
  const writer = new Writer({ format: 'N3' });
  writer.addQuads(quads);
  const graphContent = await new Promise<string>((resolve, reject) => {
    writer.end((error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });

  // We specify string for outputType so that we can both run the query
  // on the eyereasoner CLI manually with the --strings option, while also
  // run it here via the API and filter out the log:outputString triplets,
  // enabling the same query file to be used in both cases, as a pattern
  // for developing future queries.
  const eyeOptions: any = {
    outputType: "string"
  };

  try {
    // Execute the query using n3reasoner
    console.log(`Executing query ${queryName} with options:`, eyeOptions);
    const result = await n3reasoner(graphContent, queryContent, eyeOptions);

    // If result is already an array of quads, return it
    if (Array.isArray(result) && result.length > 0 && result[0].subject) {
      console.log(`Received ${result.length} quads directly from reasoner`);
      return result;
    }

    // If we got a string instead (fallback case), filter out log:outputString statements and parse
    if (typeof result === 'string') {
      console.log(`Query ${queryName} result sample (first 200 chars): ${result.substring(0, 200)}`);
      
      // Filter out lines containing log:outputString
      // This regex matches lines that contain log:outputString as a predicate
      const outputStringRegex = /^.*\s+log:outputString\s+.*\.$/gm;
      const filteredResult = result.replace(outputStringRegex, '');
      
      console.log(`Filtered out log:outputString statements from result`);
      
      try {
        const parser = new Parser();
        const parsedQuads = parser.parse(filteredResult);
        console.log(`Parsed ${parsedQuads.length} quads from filtered result`);
        return parsedQuads;
      } catch (parseError) {
        console.error(`Error parsing filtered result:`, parseError);
        
        // If parsing still fails, try a more aggressive approach
        // Extract only lines that look like valid RDF triples (starting with '<')
        const tripleLines = filteredResult.split('\n')
          .filter(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('<') && trimmed.includes('>') && !trimmed.includes('log:outputString');
          });
        
        if (tripleLines.length > 0) {
          const triplesOnly = tripleLines.join('\n');
          console.log(`Extracted ${tripleLines.length} potential triple lines`);
          
          try {
            const parser = new Parser();
            const parsedQuads = parser.parse(triplesOnly);
            console.log(`Parsed ${parsedQuads.length} quads from extracted triples`);
            return parsedQuads;
          } catch (extractError) {
            console.error(`Error parsing extracted triples:`, extractError);
          }
        }
        
        console.warn(`Could not parse result into valid quads, returning empty array`);
        return [];
      }
    }

    // If we got something else, return empty array
    console.warn(`Unexpected result type: ${typeof result}`);
    return [];
  } catch (error) {
    console.error(`Error details for query ${queryName}:`, error);
    throw new Error(`Error executing EYE reasoner: ${error instanceof Error ? error.message : String(error)}`);
  }
}
