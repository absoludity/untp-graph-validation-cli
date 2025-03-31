import * as $rdf from 'rdflib';
import jsonld from 'jsonld';
import chalk from 'chalk';
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

  // Track the total statements count
  let previousStatementsCount = 0;

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
          graphNodes: 0,
          previousStatements: previousStatementsCount
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
          // Add debug logging before parsing
          console.log(chalk.gray(`  Debug: Parsing N-Quads for ${filePath}`));
          console.log(chalk.gray(`  Debug: Using base URI: ${baseUri}`));
          console.log(chalk.gray(`  Debug: Store has ${store.statements.length} statements before parsing`));
          
          // Sample the first few lines of N-Quads for debugging
          const nquadsPreview = nquads.toString().split('\n').slice(0, 3).join('\n');
          console.log(chalk.gray(`  Debug: N-Quads preview:\n${nquadsPreview}...`));
          
          $rdf.parse(
            nquads.toString(), // Convert to string to satisfy the type requirement
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
                // Debug logging after parsing
                console.log(chalk.gray(`  Debug: Store has ${store.statements.length} statements after parsing`));
                
                // Count statements in different ways for comparison
                const statementsInNamedGraph = store.statementsMatching(null, null, null, $rdf.sym(baseUri));
                console.log(chalk.gray(`  Debug: Statements in named graph '${baseUri}': ${statementsInNamedGraph.length}`));
                
                // Try to find statements related to this document
                const subjectMatches = store.statementsMatching($rdf.sym(baseUri), null, null);
                console.log(chalk.gray(`  Debug: Statements with subject '${baseUri}': ${subjectMatches.length}`));
                
                // Check if any statements have this URI in any position
                let relatedStatements = 0;
                for (const stmt of store.statements) {
                  if (
                    (stmt.subject.termType === 'NamedNode' && stmt.subject.value === baseUri) ||
                    (stmt.predicate.termType === 'NamedNode' && stmt.predicate.value === baseUri) ||
                    (stmt.object.termType === 'NamedNode' && stmt.object.value === baseUri) ||
                    (stmt.graph.termType === 'NamedNode' && stmt.graph.value === baseUri)
                  ) {
                    relatedStatements++;
                  }
                }
                console.log(chalk.gray(`  Debug: Statements related to '${baseUri}': ${relatedStatements}`));
                
                // Count the number of statements added to the graph for this file
                if (result.metadata) {
                  result.metadata.graphNodes = store.statements.length - (result.metadata.previousStatements || 0);
                  console.log(chalk.gray(`  Debug: Calculated graphNodes: ${result.metadata.graphNodes}`));
                }
                
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
      
      // Update the previous statements count for the next file
      previousStatementsCount = store.statements.length;
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
 * @param graph - Graph URI (optional)
 * @returns Array of matching statements
 */
export function queryGraph(
  store: $rdf.Store,
  subject?: string,
  predicate?: string,
  object?: string,
  graph?: string
): $rdf.Statement[] {
  const subjectNode = subject ? $rdf.sym(subject) : null;
  const predicateNode = predicate ? $rdf.sym(predicate) : null;
  const objectNode = object ? (
    object.startsWith('http') ? $rdf.sym(object) : $rdf.lit(object)
  ) : null;
  const graphNode = graph ? $rdf.sym(graph) : null;
  
  return store.statementsMatching(subjectNode, predicateNode, objectNode, graphNode);
}
