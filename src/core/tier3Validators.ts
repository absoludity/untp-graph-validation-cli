import { DataFactory, Parser, Store, Writer } from 'n3';
import jsonld from 'jsonld';
import chalk from 'chalk';
import fs from 'fs';
import { ValidationResult } from './types.js';

const { namedNode, literal, quad } = DataFactory;

/**
 * Creates an RDF graph from pre-parsed JSON-LD data
 * @param parsedData - Record of file paths to their parsed JSON-LD data
 * @returns Promise with the RDF store and any validation results
 */
export async function createRDFGraph(
  parsedData: Record<string, any>
): Promise<{
  store: Store;
  results: Record<string, ValidationResult>;
}> {
  // Create a new N3 Store
  const store = new Store();
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
        const graphName = namedNode(baseUri);
        
        // Convert JSON-LD to N-Quads (RDF format) using jsonld.js
        const nquads = await jsonld.toRDF(jsonData, {
          format: 'application/n-quads'
        });
        
        const nquadsString = nquads.toString();
        const parser = new Parser({ format: 'N-Quads' });
        const quads = parser.parse(nquadsString);
        
        // Add each quad to the store with the document's URI as the graph name
        let addedToGraph = 0;
        for (const q of quads) {
          // Create a new quad with the same subject, predicate, object but with our graph name
          const quadWithGraph = quad(q.subject, q.predicate, q.object, graphName);
          store.addQuad(quadWithGraph);
          addedToGraph++;
        }
        
        // Count quads in the named graph
        const graphQuads = store.getQuads(null, null, null, graphName);

        // Update metadata
        if (result.metadata) {
          result.metadata.graphNodes = graphQuads.length;
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

  return { store, results };
}

/**
 * Queries an RDF graph for specific patterns
 * @param store - The N3 Store to query
 * @param subject - Subject URI (optional)
 * @param predicate - Predicate URI (optional)
 * @param object - Object value or URI (optional)
 * @param graph - Graph URI (optional)
 * @returns Array of matching quads
 */
export function queryGraph(
  store: Store,
  subject?: string,
  predicate?: string,
  object?: string,
  graph?: string
): any[] {
  return store.getQuads(
    subject ? namedNode(subject) : null,
    predicate ? namedNode(predicate) : null,
    object ? (object.startsWith('http') ? namedNode(object) : literal(object)) : null,
    graph ? namedNode(graph) : null
  );
}

/**
 * Saves an RDF graph to files in different formats
 * @param store - The N3 Store to save
 * @param baseFilename - Base filename without extension
 * @returns Promise that resolves when files are saved
 */
export async function saveGraphToFiles(store: Store, baseFilename: string = 'credential-graph'): Promise<string[]> {
  const savedFiles: string[] = [];
  
  try {
    // Save as Turtle
    const ttlFile = `${baseFilename}.ttl`;
    const writerTurtle = new Writer({ format: 'Turtle' });
    
    const ttlData = await new Promise<string>((resolve, reject) => {
      writerTurtle.addQuads(store.getQuads(null, null, null, null));
      writerTurtle.end((error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    
    fs.writeFileSync(ttlFile, ttlData);
    savedFiles.push(ttlFile);
    
    // Save as N-Quads
    const nqFile = `${baseFilename}.nq`;
    const writerNQuads = new Writer({ format: 'N-Quads' });
    
    const nqData = await new Promise<string>((resolve, reject) => {
      writerNQuads.addQuads(store.getQuads(null, null, null, null));
      writerNQuads.end((error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    
    fs.writeFileSync(nqFile, nqData);
    savedFiles.push(nqFile);
    
    // Save as TriG (Turtle with named graphs)
    const trigFile = `${baseFilename}.trig`;
    const writerTriG = new Writer({ format: 'TriG' });
    
    const trigData = await new Promise<string>((resolve, reject) => {
      writerTriG.addQuads(store.getQuads(null, null, null, null));
      writerTriG.end((error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    
    fs.writeFileSync(trigFile, trigData);
    savedFiles.push(trigFile);
    
  } catch (error) {
    console.error(`Error saving graph: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return savedFiles;
}
