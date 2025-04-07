import chalk from 'chalk';
import { ValidationResult } from '../core/types.js';
import { createRDFGraph, saveGraphToFiles, executeQueriesOnGraph } from '../core/tier3Validators.js';
import { Parser, Quad } from 'n3';

/**
 * Checks product claims in the RDF graph and verifies if they are attested
 * @param quads - Array of quads representing the RDF graph
 * @param verbose - Whether to show verbose output
 * @returns Promise with validation result and details
 */
async function checkProductClaims(
  quads: Quad[],
  verbose: boolean
): Promise<{
  valid: boolean;
  verifiedClaims: number;
  totalClaims: number;
  details: string[];
}> {
  const details: string[] = [];
  let verifiedClaims = 0;
  let totalClaims = 0;
  
  try {
    if (verbose) {
      console.log(chalk.gray('    Executing queries to find product claims and attestations...'));
    }
    
    // Execute queries to get all claims and verified claims
    const queryResults = await executeQueriesOnGraph(quads, ['list-product-claims', 'list-verified-product-claims']);
    
    // Get the results as quads
    const allClaimsQuads = queryResults['list-product-claims'] || [];
    const verifiedClaimsQuads = queryResults['list-verified-product-claims'] || [];
    
    if (verbose) {
      console.log(chalk.gray('    Processing query results...'));
      console.log(chalk.gray(`    Found ${allClaimsQuads.length} quads in product claims result`));
      console.log(chalk.gray(`    Found ${verifiedClaimsQuads.length} quads in verified claims result`));
    }
    
    // Create sets to track claims and verified claims
    const allClaims = new Map<string, { product: string, topic: string, productName: string }>();
    const verifiedClaimsSet = new Set<string>();
    
    // Extract product claims
    // We're looking for patterns like:
    // ?product result:hasConformityClaim ?claim .
    // ?claim result:topic ?topic .
    // ?product result:name ?productName .
    
    // First, find all products with claims
    const productClaims = new Map<string, Set<string>>();
    const productNames = new Map<string, string>();
    const claimTopics = new Map<string, string>();
    
    for (const q of allClaimsQuads) {
      // Get product names
      if (q.predicate.value === 'http://example.org/result#name') {
        productNames.set(q.subject.value, q.object.value);
      }
      
      // Get claim topics
      if (q.predicate.value === 'http://example.org/result#topic') {
        claimTopics.set(q.subject.value, q.object.value);
      }
      
      // Get product claims
      if (q.predicate.value === 'http://example.org/result#hasConformityClaim') {
        const product = q.subject.value;
        const claim = q.object.value;
        
        if (!productClaims.has(product)) {
          productClaims.set(product, new Set());
        }
        productClaims.get(product)?.add(claim);
      }
    }
    
    // Now build the full claim information
    for (const [product, claims] of productClaims.entries()) {
      const productName = productNames.get(product) || 'Unknown Product';
      
      for (const claim of claims) {
        const topic = claimTopics.get(claim);
        
        if (topic) {
          const claimId = `${product}|${topic}`;
          allClaims.set(claimId, { product, topic, productName });
          
          if (verbose) {
            details.push(`Found claim: Product "${productName}" (${product}) has claim about ${topic}`);
          }
        }
      }
    }
    
    // Extract verified claims
    // We're looking for patterns like:
    // ?product result:hasVerifiedClaim ?claim .
    // ?claim result:topic ?topic .
    
    const verifiedProductClaims = new Map<string, Set<string>>();
    const verifiedClaimTopics = new Map<string, string>();
    
    for (const q of verifiedClaimsQuads) {
      // Get claim topics
      if (q.predicate.value === 'http://example.org/result#topic') {
        verifiedClaimTopics.set(q.subject.value, q.object.value);
      }
      
      // Get verified product claims
      if (q.predicate.value === 'http://example.org/result#hasVerifiedClaim') {
        const product = q.subject.value;
        const claim = q.object.value;
        
        if (!verifiedProductClaims.has(product)) {
          verifiedProductClaims.set(product, new Set());
        }
        verifiedProductClaims.get(product)?.add(claim);
      }
    }
    
    // Now build the verified claim information
    for (const [product, claims] of verifiedProductClaims.entries()) {
      for (const claim of claims) {
        const topic = verifiedClaimTopics.get(claim);
        
        if (topic) {
          const claimId = `${product}|${topic}`;
          verifiedClaimsSet.add(claimId);
          
          const claimInfo = allClaims.get(claimId);
          if (verbose && claimInfo) {
            details.push(`Verified claim: Product "${claimInfo.productName}" (${product}) has verified claim about ${topic}`);
          }
        }
      }
    }
    
    // Count claims
    totalClaims = allClaims.size;
    
    // Check which claims are verified
    for (const [claimId, claimInfo] of allClaims.entries()) {
      if (verifiedClaimsSet.has(claimId)) {
        verifiedClaims++;
      } else {
        details.push(chalk.yellow(`Unverified claim: Product "${claimInfo.productName}" (${claimInfo.product}) has unverified claim about ${claimInfo.topic}`));
      }
    }
    
    // Add summary
    details.push(`Total claims: ${totalClaims}, Verified: ${verifiedClaims}, Unverified: ${totalClaims - verifiedClaims}`);
    
    return {
      valid: verifiedClaims === totalClaims && totalClaims > 0,
      verifiedClaims,
      totalClaims,
      details
    };
  } catch (error) {
    details.push(chalk.red(`Error checking product claims: ${error instanceof Error ? error.message : String(error)}`));
    return {
      valid: false,
      verifiedClaims: 0,
      totalClaims: 0,
      details
    };
  }
}

/**
 * Performs Tier 3 validation checks using RDF graph analysis
 * @param filesData - Dictionary of file paths to parsed JSON data
 * @param verbose - Whether to show verbose output
 * @param saveGraph - Whether to save the graph to a file
 * @returns Object with validation summary and results
 */
export async function tier3ChecksForGraph(
  filesData: Record<string, any>,
  verbose: boolean,
  saveGraph?: boolean
): Promise<{
  validFiles: number;
  totalFiles: number;
  results: Record<string, ValidationResult>;
}> {
  console.log(chalk.blue.bold('\nTier 3 testing - analyzing credentials as an RDF graph'));

  // Create RDF graph from all files
  console.log(chalk.gray('  Creating RDF graph from all credentials...'));
  const { store, results, allQuads } = await createRDFGraph(filesData);
  
  // Count valid files
  let validFiles = 0;
  const totalFiles = Object.keys(results).length;
  
  for (const [filePath, result] of Object.entries(results)) {
    console.log(chalk.cyan(`\n${filePath}`));
    
    if (result.valid) {
      console.log(chalk.green(`  ✓ Successfully added named graph ${result.metadata?.graphName} to RDF graph (${result.metadata?.graphNodes || 0} quads)`));
      validFiles++;
    } else {
      console.log(chalk.red('  ✗ Failed to add to RDF graph'));
      result.errors.forEach(error => {
        console.log(chalk.red(`    - ${error.message}`));
      });
    }
  }
  
  // Only perform graph analysis if we have valid files
  if (validFiles > 0) {
    console.log(chalk.gray('\n  Analyzing RDF graph...'));
    
    // Print total graph statistics
    const totalQuads = store.size;
    console.log(chalk.gray(`\n  Total RDF quads in graph: ${totalQuads}`));
    
    // Check product claims
    console.log(chalk.gray('\n  Checking product claims and attestations...'));
    const claimResults = await checkProductClaims(allQuads, verbose);
    
    if (claimResults.valid) {
      console.log(chalk.green(`  ✓ All ${claimResults.totalClaims} product claims are verified by attestations`));
    } else if (claimResults.totalClaims === 0) {
      console.log(chalk.yellow('  ⚠ No product claims found in the credentials'));
    } else {
      console.log(chalk.yellow(`  ⚠ Only ${claimResults.verifiedClaims} of ${claimResults.totalClaims} product claims are verified by attestations`));
    }
    
    // Print details if verbose or there are unverified claims
    if (verbose || (!claimResults.valid && claimResults.totalClaims > 0)) {
      claimResults.details.forEach(detail => {
        console.log(`    ${detail}`);
      });
    }
    
    // Save the graph to a file if requested
    if (saveGraph) {
      try {
        console.log(chalk.gray('\n  Saving RDF graph to file...'));
        const savedFile = await saveGraphToFiles(store);
        console.log(chalk.green(`  ✓ Graph saved to ${savedFile} (N3 format for eye-reasoner)`));
      } catch (error) {
        console.log(chalk.red(`  ✗ Error saving graph: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }
  
  return { validFiles, totalFiles, results };
}
