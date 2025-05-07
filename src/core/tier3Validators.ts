import { DataFactory, Store, Writer, Quad } from 'n3';
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
  dppId: string;  // ID of the Digital Product Passport this product belongs to
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
      // Read file but don't store content as we pass the path directly
      fs.readFileSync(filePath, 'utf8');

      // Execute the inference rule with the full file path
      const quads = store.getQuads(null, null, null, null);
      const inferenceResults = await executeQuery(filePath, quads);

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
 * including verification information from inferences
 * @param store - The N3 Store containing the RDF graph
 * @returns Promise with an array of Product objects containing claims and criteria with verification info
 */
export async function listAllProductClaimCriteria(store: Store): Promise<Product[]> {
  try {
    // Create a query engine
    const myEngine = new QueryEngine();

    // Execute a SPARQL query directly on the store to get products, claims, and criteria
    const result = await myEngine.queryBindings(`
      PREFIX dpp: <https://test.uncefact.org/vocabulary/untp/dpp/0/>
      PREFIX schemaorg: <https://schema.org/>
      PREFIX untp: <https://test.uncefact.org/vocabulary/untp/core/0/>
      PREFIX vc: <https://www.w3.org/2018/credentials#>
      PREFIX result: <http://example.org/result#>

      SELECT ?credential ?product ?productName ?claim ?topic ?conformance ?criterion ?criterionName
             (EXISTS { ?claim result:allCriteriaVerified true } AS ?claimVerified)
             (EXISTS { ?claim result:verifiedCriterion ?criterion } AS ?criterionVerified)
      WHERE {
        ?credential a dpp:DigitalProductPassport .
        ?credential vc:credentialSubject ?subject .
        ?subject untp:product ?product .
        ?product schemaorg:name ?productName .

        # Find conformity claims
        ?subject untp:conformityClaim ?claim .
        ?claim untp:conformityTopic ?topic .
        ?claim untp:conformance ?conformance .

        # Get criteria if they exist
        ?claim untp:Criterion ?criterion .
        ?criterion schemaorg:name ?criterionName .
      }
    `, {
      sources: [store]
    });

    // Create maps for organizing the data
    const productsMap = new Map<string, Product>();
    const claimsMap = new Map<string, Claim>();

    // Process each binding (row of results) using async iteration
    for await (const binding of result) {
      const dppId = binding.get('credential')?.value || '';
      const productId = binding.get('product')?.value || '';
      const productName = binding.get('productName')?.value || '';
      const claimId = binding.get('claim')?.value || '';
      const topic = binding.get('topic')?.value || '';
      const conformance = binding.get('conformance')?.value || '';
      const criterionId = binding.get('criterion')?.value || '';
      const criterionName = binding.get('criterionName')?.value || '';
      const claimVerified = binding.get('claimVerified')?.value === 'true';
      const criterionVerified = binding.get('criterionVerified')?.value === 'true';

      // Create or get the product
      if (!productsMap.has(productId)) {
        productsMap.set(productId, {
          id: productId,
          name: productName,
          claims: [],
          dppId: dppId
        });
      }

      // Create or get the claim
      const claimKey = `${productId}-${claimId}`;
      if (!claimsMap.has(claimKey)) {
        const claim: Claim = {
          id: claimId,
          topic: topic,
          conformance: conformance,
          criteria: [],
          verified: claimVerified
        };
        claimsMap.set(claimKey, claim);
        productsMap.get(productId)!.claims.push(claim);
      } else if (claimVerified) {
        // Update verification status if this binding indicates the claim is verified
        claimsMap.get(claimKey)!.verified = true;
      }

      // Add the criterion to the claim if it doesn't already exist
      const claim = claimsMap.get(claimKey)!;
      if (!claim.criteria.some(c => c.id === criterionId)) {
        const criterion: Criterion = {
          id: criterionId,
          name: criterionName,
          verifiedBy: criterionVerified ? 'verified' : undefined
        };
        claim.criteria.push(criterion);
      }
    }


    // Get verifier information for verified criteria
    const verifierResult = await myEngine.queryBindings(`
      PREFIX dcc: <https://test.uncefact.org/vocabulary/untp/dcc/0/>
      PREFIX result: <http://example.org/result#>
      PREFIX schemaorg: <https://schema.org/>
      PREFIX vc: <https://www.w3.org/2018/credentials#>

      SELECT ?criterion ?verifierId ?verifierName
      WHERE {
        ?claim result:verifiedCriterion ?criterion .
        ?claim result:dependsOn ?dccCredential .
        ?dccCredential vc:issuer ?verifierId .
        ?verifierId schemaorg:name ?verifierName .
      }
    `, {
      sources: [store]
    });

    // Add verifier information to criteria
    for await (const binding of verifierResult) {
      const criterionId = binding.get('criterion')?.value || '';
      const verifierId = binding.get('verifierId')?.value || '';
      const verifierName = binding.get('verifierName')?.value || '';

      // Find this criterion in all claims
      for (const claim of claimsMap.values()) {
        const criterion = claim.criteria.find(c => c.id === criterionId);
        if (criterion) {
          criterion.verifiedBy = verifierId;
          criterion.verifierName = verifierName;
        }
      }
    }

    // Get simple claims (claims without criteria)
    const simpleClaimsResult = await myEngine.queryBindings(`
      PREFIX dpp: <https://test.uncefact.org/vocabulary/untp/dpp/0/>
      PREFIX schemaorg: <https://schema.org/>
      PREFIX untp: <https://test.uncefact.org/vocabulary/untp/core/0/>
      PREFIX vc: <https://www.w3.org/2018/credentials#>
      PREFIX result: <http://example.org/result#>

      SELECT ?credential ?product ?productName ?claim ?topic ?conformance
             (EXISTS { ?claim result:allCriteriaVerified true } AS ?claimVerified)
      WHERE {
        ?credential a dpp:DigitalProductPassport .
        ?credential vc:credentialSubject ?subject .
        ?subject untp:product ?product .
        ?product schemaorg:name ?productName .

        # Find conformity claims
        ?subject untp:conformityClaim ?claim .
        ?claim untp:conformityTopic ?topic .
        ?claim untp:conformance ?conformance .

        # Ensure this is a simple claim (no criteria)
        FILTER NOT EXISTS { ?claim untp:Criterion ?criterion }
      }
    `, {
      sources: [store]
    });

    // Process simple claims
    for await (const binding of simpleClaimsResult) {
      const dppId = binding.get('credential')?.value || '';
      const productId = binding.get('product')?.value || '';
      const productName = binding.get('productName')?.value || '';
      const claimId = binding.get('claim')?.value || '';
      const topic = binding.get('topic')?.value || '';
      const conformance = binding.get('conformance')?.value || '';
      const claimVerified = binding.get('claimVerified')?.value === 'true';

      // Create or get the product
      if (!productsMap.has(productId)) {
        productsMap.set(productId, {
          id: productId,
          name: productName,
          claims: [],
          dppId: dppId
        });
      }

      // Create the simple claim
      const claimKey = `${productId}-${claimId}`;
      if (!claimsMap.has(claimKey)) {
        const claim: Claim = {
          id: claimId,
          topic: topic,
          conformance: conformance,
          criteria: [],
          verified: claimVerified
        };
        claimsMap.set(claimKey, claim);
        productsMap.get(productId)!.claims.push(claim);
      } else if (claimVerified) {
        // Update verification status if this binding indicates the claim is verified
        claimsMap.get(claimKey)!.verified = true;
      }
    }

    return Array.from(productsMap.values());
  } catch (error) {
    console.error(`Error listing product claim criteria: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return [];
  }
}


/**
 * Checks a DPP's dependencies to get a set of verifiable credentials required
 * to support the claims of the product passport, then follows the trust chain
 * from each credential issuer via DigitalIdentityAnchors (if any), returning
 * the issuers of the credentials that are not attested.
 *
 * This function handles nested DIAs (Digital Identity Anchors) that attest to other DIAs,
 * creating a complete trust chain through multiple levels of attestation.
 *
 * @param store - The N3 Store containing the RDF graph
 * @param dppId - The ID of the Digital Product Passport to check
 * @returns Promise with an array of unattested issuer IDs
 * @throws Error if the query fails.
 */
export async function getUnattestedIssuersForProduct(store: Store, dppId: string): Promise<string[]> {
  try {
    // Create a query engine
    const myEngine = new QueryEngine();

    // Query for all credentials that attest to claims in the DPP
    const result = await myEngine.queryBindings(`
      PREFIX result: <http://example.org/result#>

      SELECT ?credential
      WHERE {
        <${dppId}> result:claimsAttestedBy ?credential .
      }
    `, {
      sources: [store]
    });

    // Collect all credential IDs including the DPP itself
    const credentialIds: string[] = [dppId];

    // Add all credentials that attest to claims in the DPP
    for await (const binding of result) {
      const credentialId = binding.get('credential')?.value;
      if (credentialId && !credentialIds.includes(credentialId)) {
        credentialIds.push(credentialId);
      }
    }

    // credentialIds now contains all credentials that are relevant to the DPP,
    // for which we need to ensure we trust the issuers.


    // Use a SPARQL path query to find all identity attestation chains
    const attestationResult = await myEngine.queryBindings(`
      PREFIX result: <http://example.org/result#>

      SELECT ?credential ?dia
      WHERE {
        # Find all DIAs in the attestation chain using property path
        ?credential result:issuerIdentityAttestedBy ?dia .
      }
    `, {
      sources: [store]
    });

    // Log the attestation chains for debugging
    console.log('Attestation chains:');
    const attestationChains: Record<string, string[]> = {};

    for await (const binding of attestationResult) {
      const credential = binding.get('credential')?.value || '';
      const dia = binding.get('dia')?.value || '';

      if (!attestationChains[credential]) {
        attestationChains[credential] = [];
      }

      attestationChains[credential].push(dia);
      console.log(`Credential ${credential} is attested by DIA ${dia}`);
    }

    // For now, just return an empty array as we're still developing this feature
    return [];
  } catch (error) {
    console.error(`Error getting attested credentials: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
