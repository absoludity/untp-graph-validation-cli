import { DataFactory, Parser, Store, Writer, Quad } from 'n3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ValidationResult } from './types.js';
import { executeQuery, parsedDataToNQuads } from './utils.js';

// Interfaces for product claim criteria
interface Criterion {
  id: string;
  name: string;
  verifiedBy?: string;
  verifierName?: string;
}

interface Claim {
  id: string;
  topic: string;
  conformance: string;
  criteria: Criterion[];
  verified?: boolean;
}

interface Product {
  id: string;
  name: string;
  claims: Claim[];
}

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
 * Runs all inference rules in the inferences directory in numerical order
 * @param store - The N3 Store to run inferences on
 * @returns Promise with the resulting store after all inferences
 */
export async function runInferences(store: Store): Promise<Store> {
  try {
    // Get the directory path for inferences
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const inferencesDir = path.join(__dirname, 'inferences');
    
    // Read all inference files
    const files = fs.readdirSync(inferencesDir)
      .filter(file => file.endsWith('.n3'))
      .sort(); // Sort to ensure numerical order
    
    // Create a new store for the inferences
    let resultStore = new Store(store.getQuads(null, null, null, null));
    
    // Run each inference in order
    for (const file of files) {
      const filePath = path.join(inferencesDir, file);
      const n3Content = fs.readFileSync(filePath, 'utf8');
      
      // Parse the N3 file
      const parser = new Parser();
      const inferenceQuads = parser.parse(n3Content);
      
      // Execute the inference rule
      const quads = resultStore.getQuads(null, null, null, null);
      const inferenceResults = await executeQuery(filePath, quads, {
        passOnlyNew: true,
        nope: true
      });
      
      // Add the inference results to the store
      resultStore.addQuads(inferenceResults);
      
      console.log(`Applied inference rule: ${file} (added ${inferenceResults.length} quads)`);
    }
    
    return resultStore;
  } catch (error) {
    console.error(`Error running inferences: ${error instanceof Error ? error.message : String(error)}`);
    return store; // Return original store on error
  }
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

/**
 * Extracts all product claim criteria from the RDF graph using N3 Store querying
 * @param quads - Array of quads representing the RDF graph
 * @returns Promise with an array of Product objects containing claims and criteria
 */
export async function listAllProductClaimCriteria(quads: Quad[]): Promise<Product[]> {
  try {
    // Execute the query to get all product claim criteria
    const queryResults = await executeQuery('list-all-product-claim-criteria', quads, {
      passOnlyNew: true,
      nope: true
    });

    // Create a temporary store for easier querying
    const store = new Store(queryResults);

    // Create maps for organizing the data
    const productsMap = new Map<string, Product>();
    const claimsMap = new Map<string, Claim>();
    const criteriaMap = new Map<string, Criterion>();

    // Extract product names
    const productNameQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#productName'),
      null,
      null
    );

    // Create product objects
    for (const quad of productNameQuads) {
      const productId = quad.subject.value;
      const productName = quad.object.value;

      productsMap.set(productId, {
        id: productId,
        name: productName,
        claims: []
      });
    }

    // Extract claim topics and conformance
    const claimTopicQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#topic'),
      null,
      null
    );

    for (const quad of claimTopicQuads) {
      const claimId = quad.subject.value;
      const topic = quad.object.value;

      claimsMap.set(claimId, {
        id: claimId,
        topic,
        conformance: '',
        criteria: []
      });
    }

    // Add conformance to claims
    const conformanceQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#conformance'),
      null,
      null
    );

    for (const quad of conformanceQuads) {
      const claimId = quad.subject.value;
      const conformance = quad.object.value;

      if (claimsMap.has(claimId)) {
        claimsMap.get(claimId)!.conformance = conformance;
      }
    }

    // Extract criterion names
    const criterionNameQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#criterionName'),
      null,
      null
    );

    for (const quad of criterionNameQuads) {
      const criterionId = quad.subject.value;
      const criterionName = quad.object.value;

      criteriaMap.set(criterionId, {
        id: criterionId,
        name: criterionName
      });
    }

    // Connect criteria to claims
    const criterionQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#criterion'),
      null,
      null
    );

    for (const quad of criterionQuads) {
      const claimId = quad.subject.value;
      const criterionId = quad.object.value;

      if (claimsMap.has(claimId) && criteriaMap.has(criterionId)) {
        claimsMap.get(claimId)!.criteria.push(criteriaMap.get(criterionId)!);
      }
    }

    // Connect claims to products
    const productClaimQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#hasConformityClaim'),
      null,
      null
    );

    for (const quad of productClaimQuads) {
      const productId = quad.subject.value;
      const claimId = quad.object.value;

      if (productsMap.has(productId) && claimsMap.has(claimId)) {
        productsMap.get(productId)!.claims.push(claimsMap.get(claimId)!);
      }
    }

    // Convert map to array
    return Array.from(productsMap.values());
  } catch (error) {
    console.error(`Error listing product claim criteria: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Extracts all verified product claim criteria from the RDF graph
 * @param quads - Array of quads representing the RDF graph
 * @returns Promise with an array of Product objects containing verified claims and criteria
 */
export async function listVerifiedProductClaimCriteria(quads: Quad[]): Promise<Product[]> {
  try {
    // First get all product claims
    const allProducts = await listAllProductClaimCriteria(quads);

    // Create a deep copy with verification fields initialized
    const products = JSON.parse(JSON.stringify(allProducts)) as Product[];
    products.forEach(product => {
      product.claims.forEach(claim => {
        claim.verified = false;
        claim.criteria.forEach(criterion => {
          criterion.verifiedBy = undefined;
          criterion.verifierName = undefined;
        });
      });
    });

    // Create maps for faster lookups
    const productsMap = new Map<string, Product>();
    const claimsMap = new Map<string, Claim>();
    const criteriaMap = new Map<string, Criterion>();

    // Populate maps
    products.forEach(product => {
      productsMap.set(product.id, product);
      product.claims.forEach(claim => {
        claimsMap.set(claim.id, claim);
        claim.criteria.forEach(criterion => {
          criteriaMap.set(criterion.id, criterion);
        });
      });
    });

    // Execute the query to get verified product claim criteria
    const queryResults = await executeQuery('list-verified-product-claim-criteria', quads, {
      passOnlyNew: true,
      nope: true
    });

    // Create a temporary store for easier querying
    const store = new Store(queryResults);

    // Mark conformity claims
    const verifiedClaimQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#hasVerifiedClaim'),
      null,
      null
    );

    // Mark verified criteria
    const verifiedByQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#verifiedBy'),
      null,
      null
    );

    for (const quad of verifiedByQuads) {
      const criterionId = quad.subject.value;
      const verifierId = quad.object.value;

      if (criteriaMap.has(criterionId)) {
        criteriaMap.get(criterionId)!.verifiedBy = verifierId;
      }
    }

    // Add verifier names
    const verifierNameQuads = store.getQuads(
      null,
      DataFactory.namedNode('http://example.org/result#issuerName'),
      null,
      null
    );

    for (const quad of verifierNameQuads) {
      const verifierId = quad.subject.value;
      const verifierName = quad.object.value;

      // Find criteria verified by this verifier
      for (const criterion of criteriaMap.values()) {
        if (criterion.verifiedBy === verifierId) {
          criterion.verifierName = verifierName;
        }
      }
    }

    // Mark verified claims based on verified criteria
    // A claim is considered verified if either:
    // 1. It has no criteria (simple claim)
    // 2. ALL of its criteria are verified
    for (const claim of claimsMap.values()) {
      if (claim.criteria.length === 0) {
        // For claims with no criteria, check if they appear in the verified claims
        const hasVerifiedClaim = store.getQuads(
          null,
          DataFactory.namedNode('http://example.org/result#hasVerifiedClaim'),
          DataFactory.namedNode(claim.id),
          null
        ).length > 0;

        claim.verified = hasVerifiedClaim;
      } else {
        // For claims with criteria, check if all criteria are verified
        const allCriteriaVerified = claim.criteria.every(criterion => criterion.verifiedBy !== undefined);
        claim.verified = allCriteriaVerified;
      }
    }

    return products;
  } catch (error) {
    console.error(`Error listing verified product claim criteria: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
