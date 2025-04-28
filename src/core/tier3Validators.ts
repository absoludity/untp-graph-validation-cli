import { DataFactory, Parser, Store, Writer, Quad } from 'n3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { QueryEngine } from '@comunica/query-sparql';
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
 * @param store - The N3 Store to run inferences on (will be updated in place)
 * @returns Promise with boolean indicating success or failure
 */
export async function runInferences(store: Store): Promise<boolean> {
  try {
    // Get the directory path for inferences
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const inferencesDir = path.join(__dirname, 'inferences');
    
    // Read all inference files
    const files = fs.readdirSync(inferencesDir)
      .filter(file => file.endsWith('.n3'))
      .sort(); // Sort to ensure numerical order
    
    // Run each inference in order
    for (const file of files) {
      const filePath = path.join(inferencesDir, file);
      const n3Content = fs.readFileSync(filePath, 'utf8');
      
      // Execute the inference rule
      const quads = store.getQuads(null, null, null, null);
      const inferenceResults = await executeQuery(filePath, quads, {
        passOnlyNew: true,
        nope: true
      });
      
      // Add the inference results to the store
      store.addQuads(inferenceResults);
    }
    
    return true;
  } catch (error) {
    console.error(`Error running inferences: ${error instanceof Error ? error.message : String(error)}`);
    return false;
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
 * Extracts all product claim criteria from the RDF graph using SPARQL querying
 * @param store - The N3 Store containing the RDF graph
 * @returns Promise with an array of Product objects containing claims and criteria
 */
export async function listAllProductClaimCriteria(store: Store): Promise<Product[]> {
  try {
    // Create a query engine
    const myEngine = new QueryEngine();
    
    // Execute a SPARQL query directly on the store
    const result = await myEngine.query(`
      PREFIX dpp: <https://test.uncefact.org/vocabulary/untp/dpp/0/>
      PREFIX schemaorg: <https://schema.org/>
      PREFIX untp: <https://test.uncefact.org/vocabulary/untp/core/0/>
      PREFIX vc: <https://www.w3.org/2018/credentials#>
      
      SELECT ?product ?productName ?claim ?topic ?conformance ?criterion ?criterionName
      WHERE {
        ?credential a dpp:DigitalProductPassport .
        ?credential vc:credentialSubject ?subject .
        ?subject untp:product ?product .
        ?product schemaorg:name ?productName .
        
        # Find conformity claims
        ?subject untp:conformityClaim ?claim .
        ?claim untp:conformityTopic ?topic .
        ?claim untp:conformance ?conformance .
        ?claim untp:Criterion ?criterion .
        ?criterion schemaorg:name ?criterionName .
      }
    `, { 
      sources: [store] 
    });

    // Process the bindings to create Product objects
    const bindings = await result.bindings();
    
    // Create maps for organizing the data
    const productsMap = new Map<string, Product>();
    const claimsMap = new Map<string, Claim>();
    
    // Process each binding (row of results)
    for (const binding of bindings) {
      const productId = binding.get('product').value;
      const productName = binding.get('productName').value;
      const claimId = binding.get('claim').value;
      const topic = binding.get('topic').value;
      const conformance = binding.get('conformance').value;
      const criterionId = binding.get('criterion').value;
      const criterionName = binding.get('criterionName').value;
      
      // Create or get the product
      if (!productsMap.has(productId)) {
        productsMap.set(productId, {
          id: productId,
          name: productName,
          claims: []
        });
      }
      
      // Create or get the claim
      let claimKey = `${productId}-${claimId}`;
      if (!claimsMap.has(claimKey)) {
        const claim: Claim = {
          id: claimId,
          topic: topic,
          conformance: conformance,
          criteria: []
        };
        claimsMap.set(claimKey, claim);
        productsMap.get(productId)!.claims.push(claim);
      }
      
      // Add the criterion to the claim if it doesn't already exist
      const claim = claimsMap.get(claimKey)!;
      if (!claim.criteria.some(c => c.id === criterionId)) {
        const criterion: Criterion = {
          id: criterionId,
          name: criterionName
        };
        claim.criteria.push(criterion);
      }
    }
    
    return Array.from(productsMap.values());
  } catch (error) {
    console.error(`Error listing product claim criteria: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Extracts all verified product claim criteria from the RDF graph
 * @param store - The N3 Store containing the RDF graph
 * @returns Promise with an array of Product objects containing verified claims and criteria
 */
export async function listVerifiedProductClaimCriteria(store: Store): Promise<Product[]> {
  try {
    // First get all product claims
    const allProducts = await listAllProductClaimCriteria(store);

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

    // Create a query engine
    const myEngine = new QueryEngine();
    
    // Execute a SPARQL query to find verified criteria
    const verifiedCriteriaResult = await myEngine.query(`
      PREFIX dcc: <https://test.uncefact.org/vocabulary/untp/dcc/0/>
      PREFIX dpp: <https://test.uncefact.org/vocabulary/untp/dpp/0/>
      PREFIX schemaorg: <https://schema.org/>
      PREFIX untp: <https://test.uncefact.org/vocabulary/untp/core/0/>
      PREFIX vc: <https://www.w3.org/2018/credentials#>
      
      SELECT ?criterion ?verifierId ?verifierName
      WHERE {
        # Find product passport claims
        ?dppCredential a dpp:DigitalProductPassport .
        ?dppCredential vc:credentialSubject ?dppSubject .
        ?dppSubject untp:conformityClaim ?claim .
        ?claim untp:Criterion ?criterion .
        
        # Find matching conformity credential
        ?dccCredential a dcc:DigitalConformityCredential .
        ?dccCredential vc:issuer ?verifierId .
        ?verifierId schemaorg:name ?verifierName .
        ?dccCredential vc:credentialSubject ?dccSubject .
        ?dccSubject dcc:assessment ?assessment .
        ?assessment dcc:assessedProduct ?assessedProduct .
        ?assessment untp:Criterion ?dccCriterion .
        ?assessment untp:conformance true .
        
        # Match criteria
        FILTER(?dccCriterion = ?criterion)
      }
    `, { 
      sources: [store] 
    });
    
    // Process verified criteria
    const verifiedCriteriaBindings = await verifiedCriteriaResult.bindings();
    
    for (const binding of verifiedCriteriaBindings) {
      const criterionId = binding.get('criterion').value;
      const verifierId = binding.get('verifierId').value;
      const verifierName = binding.get('verifierName').value;
      
      if (criteriaMap.has(criterionId)) {
        criteriaMap.get(criterionId)!.verifiedBy = verifierId;
        criteriaMap.get(criterionId)!.verifierName = verifierName;
      }
    }
    
    // Mark verified claims based on verified criteria
    // A claim is considered verified if ALL of its criteria are verified
    for (const claim of claimsMap.values()) {
      if (claim.criteria.length === 0) {
        // For claims with no criteria, we need a different query
        claim.verified = false; // Default to false, will be updated below if verified
      } else {
        // For claims with criteria, check if all criteria are verified
        const allCriteriaVerified = claim.criteria.every(criterion => criterion.verifiedBy !== undefined);
        claim.verified = allCriteriaVerified;
      }
    }
    
    // For claims with no criteria, check if they are directly verified
    const simpleClaims = Array.from(claimsMap.values()).filter(claim => claim.criteria.length === 0);
    if (simpleClaims.length > 0) {
      // Execute a SPARQL query to find verified simple claims
      const verifiedSimpleClaimsResult = await myEngine.query(`
        PREFIX dcc: <https://test.uncefact.org/vocabulary/untp/dcc/0/>
        PREFIX dpp: <https://test.uncefact.org/vocabulary/untp/dpp/0/>
        PREFIX untp: <https://test.uncefact.org/vocabulary/untp/core/0/>
        PREFIX vc: <https://www.w3.org/2018/credentials#>
        
        SELECT ?claim
        WHERE {
          # Find product passport claims
          ?dppCredential a dpp:DigitalProductPassport .
          ?dppCredential vc:credentialSubject ?dppSubject .
          ?dppSubject untp:conformityClaim ?claim .
          
          # Find matching conformity credential that verifies this claim
          ?dccCredential a dcc:DigitalConformityCredential .
          ?dccCredential vc:credentialSubject ?dccSubject .
          ?dccSubject dcc:assessment ?assessment .
          ?assessment untp:conformityTopic ?topic .
          ?assessment untp:conformance true .
          
          # Match claim topic
          ?claim untp:conformityTopic ?claimTopic .
          FILTER(?claimTopic = ?topic)
          
          # Ensure this is a simple claim (no criteria)
          FILTER NOT EXISTS { ?claim untp:Criterion ?criterion }
        }
      `, { 
        sources: [store] 
      });
      
      const verifiedSimpleClaimsBindings = await verifiedSimpleClaimsResult.bindings();
      
      for (const binding of verifiedSimpleClaimsBindings) {
        const claimId = binding.get('claim').value;
        if (claimsMap.has(claimId)) {
          claimsMap.get(claimId)!.verified = true;
        }
      }
    }

    return products;
  } catch (error) {
    console.error(`Error listing verified product claim criteria: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
