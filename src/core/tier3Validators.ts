import * as $rdf from 'rdflib';
import jsonld from 'jsonld';
import { ValidationResult } from './types.js';

/**
 * Creates an RDF graph from pre-parsed JSON-LD data
 * @param parsedData - Record of file paths to their parsed JSON-LD data
 * @returns Promise with the RDF store and any validation results
 */
export async function createRDFGraph(
  parsedData: Record<string, any>
): Promise<{
  store: $rdf.Store;
  results: Record<string, ValidationResult>;
}> {
  // Create a new RDF store (graph)
  const store = $rdf.graph();
  const results: Record<string, ValidationResult> = {};

  // Process each document
  for (const [filePath, jsonData] of Object.entries(parsedData)) {
    try {
      // Create a validation result object
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        metadata: {
          filePath,
          graphNodes: 0
        }
      };
      
      try {
        // Get the base URI from the credential ID if available
        const baseUri = jsonData.id || `file://${filePath}`;
        
        // Convert JSON-LD to N-Quads (RDF format) using jsonld.js
        const nquads = await jsonld.toRDF(jsonData, {
          format: 'application/n-quads'
        });
        
        // Parse the N-Quads into the rdflib store
        await new Promise<void>((resolve, reject) => {
          $rdf.parse(
            nquads,
            store,
            baseUri,
            'application/n-quads',
            (err) => {
              if (err) {
                result.valid = false;
                result.errors.push({
                  code: 'RDF_PARSE_ERROR',
                  message: `Error parsing N-Quads into RDF: ${err.message}`,
                  error: err
                });
                reject(err);
              } else {
                // Count the number of statements added to the graph for this file
                const statements = store.statementsMatching(
                  null, null, null, $rdf.sym(baseUri)
                );
                result.metadata.graphNodes = statements.length;
                resolve();
              }
            }
          );
        }).catch(() => {
          // Error already handled in the callback
        });
      } catch (error) {
        result.valid = false;
        result.errors.push({
          code: 'RDF_GRAPH_ERROR',
          message: `Error creating RDF graph: ${error instanceof Error ? error.message : String(error)}`,
          error
        });
      }
      
      // Store the result
      results[filePath] = result;
    } catch (error) {
      // Handle unexpected errors
      results[filePath] = {
        valid: false,
        errors: [{
          code: 'PROCESSING_ERROR',
          message: `Error processing data: ${error instanceof Error ? error.message : String(error)}`,
          error
        }],
        warnings: [],
        metadata: { filePath }
      };
    }
  }

  return { store, results };
}

/**
 * Queries an RDF graph for specific patterns
 * @param store - The RDF store to query
 * @param subject - Subject URI (optional)
 * @param predicate - Predicate URI (optional)
 * @param object - Object value or URI (optional)
 * @returns Array of matching statements
 */
export function queryGraph(
  store: $rdf.Store,
  subject?: string,
  predicate?: string,
  object?: string
): $rdf.Statement[] {
  const subjectNode = subject ? $rdf.sym(subject) : null;
  const predicateNode = predicate ? $rdf.sym(predicate) : null;
  const objectNode = object ? (
    object.startsWith('http') ? $rdf.sym(object) : $rdf.lit(object)
  ) : null;
  
  return store.statementsMatching(subjectNode, predicateNode, objectNode);
}
