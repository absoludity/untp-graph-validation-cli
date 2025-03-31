import chalk from 'chalk';
import { DataFactory, Store } from 'n3';
import { ValidationResult } from '../core/types.js';
import { createRDFGraph, saveGraphToFiles } from '../core/tier3Validators.js';

const { namedNode } = DataFactory;

/**
 * Queries the RDF graph for Digital Product Passport claims
 * @param store - The N3 Store to query
 * @param verbose - Whether to show verbose output
 */
function queryDPPClaims(store: Store, verbose: boolean): void {
  // Find all Digital Product Passports in the graph
  const dppType = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
  const dppClass = namedNode('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0-beta12/DigitalProductPassport');
  
  // Find all subjects that are of type DigitalProductPassport
  const dppQuads = store.getQuads(null, dppType, dppClass, null);
  
  if (dppQuads.length > 0) {
    console.log(chalk.green(`  Found ${dppQuads.length} Digital Product Passport(s) in the graph`));
    
    // For each DPP, find its claims
    for (const dppQuad of dppQuads) {
      const dpp = dppQuad.subject;
      console.log(chalk.cyan(`\n  Digital Product Passport: ${dpp.value}`));
      
      // Find claims related to this DPP
      // First, find the credentialSubject
      const hasCredentialSubject = namedNode('https://www.w3.org/ns/credentials/v2#credentialSubject');
      const subjectQuads = store.getQuads(dpp, hasCredentialSubject, null, null);
      
      if (subjectQuads.length > 0) {
        const credentialSubject = subjectQuads[0].object;
        
        // Find conformityClaim property
        const hasConformityClaim = namedNode('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0-beta12/conformityClaim');
        const claimQuads = store.getQuads(credentialSubject, hasConformityClaim, null, null);
        
        if (claimQuads.length > 0) {
          console.log(chalk.green(`    Found ${claimQuads.length} conformity claim(s)`));
          
          // For each claim, get details
          for (let i = 0; i < claimQuads.length; i++) {
            const claim = claimQuads[i].object;
            console.log(chalk.yellow(`    Claim #${i + 1}:`));
            
            // Get claim properties
            const hasConformityTopic = namedNode('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0-beta12/conformityTopic');
            const topicQuads = store.getQuads(claim, hasConformityTopic, null, null);
            
            if (topicQuads.length > 0) {
              console.log(chalk.gray(`      Topic: ${topicQuads[0].object.value}`));
            }
            
            // Get conformance value (true/false)
            const hasConformance = namedNode('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0-beta12/conformance');
            const conformanceQuads = store.getQuads(claim, hasConformance, null, null);
            
            if (conformanceQuads.length > 0) {
              console.log(chalk.gray(`      Conformance: ${conformanceQuads[0].object.value}`));
            }
          }
        } else {
          console.log(chalk.yellow('    No conformity claims found'));
        }
      }
    }
  } else {
    console.log(chalk.yellow('  No Digital Product Passports found in the graph'));
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
  const { store, results } = await createRDFGraph(filesData);
  
  // Count valid files
  let validFiles = 0;
  const totalFiles = Object.keys(results).length;
  
  for (const [filePath, result] of Object.entries(results)) {
    console.log(chalk.cyan(`\n${filePath}`));
    
    if (result.valid) {
      console.log(chalk.green(`  ✓ Successfully added to RDF graph (${result.metadata?.graphNodes || 0} quads)`));
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
    
    // Query for DPP claims
    queryDPPClaims(store, verbose);
    
    // Print total graph statistics
    const totalQuads = store.size;
    console.log(chalk.gray(`\n  Total RDF quads in graph: ${totalQuads}`));
    
    if (verbose) {
      // TODO: Use this for something interesting.
    }
    
    // Save the graph to a file if requested
    if (saveGraph) {
      try {
        console.log(chalk.gray('\n  Saving RDF graph to files...'));
        const savedFiles = await saveGraphToFiles(store);
        
        savedFiles.forEach(file => {
          console.log(chalk.green(`  ✓ Graph saved to ${file}`));
        });
      } catch (error) {
        console.log(chalk.red(`  ✗ Error saving graph: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }
  
  return { validFiles, totalFiles, results };
}
