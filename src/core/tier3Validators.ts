import { DataFactory, Parser, Store, Writer, Quad } from 'n3';
import fs from 'fs';
import { ValidationResult } from './types.js';
import { executeQuery, parsedDataToNQuads } from './utils.js';

const { namedNode } = DataFactory;

/**
 * Creates an RDF graph from pre-parsed JSON-LD data
 * @param parsedData - Record of file paths to their parsed JSON-LD data
 * @param useNamedGraphs - Whether to store quads in named graphs (defaults to false)
 * @returns Promise with the RDF store and any validation results
 */
export async function createRDFGraph(
  parsedData: Record<string, any>,
  useNamedGraphs: boolean = false
): Promise<{
  store: Store;
  results: Record<string, ValidationResult>;
  allQuads: Quad[];
}> {
  // Create a new N3 Store
  const store = new Store();
  const results: Record<string, ValidationResult> = {};
  const allQuads: Quad[] = [];

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
        const graphName = namedNode(baseUri);

        // Convert JSON-LD to quads with optional named graphs
        const quads = await parsedDataToNQuads(jsonData, baseUri, useNamedGraphs);
        
        // Add quads to the store
        store.addQuads(quads);
        allQuads.push(...quads);

        // Update metadata with the actual number of quads generated for this document
        if (result.metadata) {
          result.metadata.graphName = graphName.value;
          result.metadata.graphNodes = quads.length;
        }
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

  return { store, results, allQuads };
}

/**
 * Executes queries against the RDF graph and returns the results
 * @param quads - Array of quads representing the RDF graph
 * @param queryNames - Array of query names to execute
 * @returns Promise with the query results as quads
 */
export async function executeQueriesOnGraph(
  quads: Quad[],
  queryNames: string[] = ['list-product-claims', 'list-verified-product-claims']
): Promise<Record<string, Quad[]>> {
  const results: Record<string, Quad[]> = {};
  
  for (const queryName of queryNames) {
    try {
      // Get RDF data results (only the new inferences)
      const rdfResults = await executeQuery(queryName, quads, {
        passOnlyNew: true,
        nope: true
      });
      
      results[queryName] = rdfResults;
    } catch (error) {
      console.error(`Error executing query ${queryName}: ${error instanceof Error ? error.message : String(error)}`);
      results[queryName] = [];
    }
  }
  
  return results;
}

/**
 * Saves an RDF graph to a file in N3 format for use with eye-reasoner
 * @param store - The N3 Store to save
 * @param baseFilename - Base filename without extension
 * @returns Promise that resolves with the saved file path
 */
export async function saveGraphToFiles(store: Store, baseFilename: string = 'credential-graph'): Promise<string> {
  try {
    // Save as N3 format
    const n3File = `${baseFilename}.n3`;
    const writerN3 = new Writer({ format: 'N3' });

    const n3Data = await new Promise<string>((resolve, reject) => {
      writerN3.addQuads(store.getQuads(null, null, null, null));
      writerN3.end((error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    fs.writeFileSync(n3File, n3Data);
    return n3File;
  } catch (error) {
    console.error(`Error saving graph: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
