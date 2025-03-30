import chalk from 'chalk';
import * as $rdf from 'rdflib';
import fs from 'fs';
import { ValidationResult } from '../core/types.js';
import { createRDFGraph, queryGraph } from '../core/tier3Validators.js';

/**
 * Queries the RDF graph for Digital Product Passport claims
 * @param store - The RDF store to query
 * @param verbose - Whether to show verbose output
 */
function queryDPPClaims(store: $rdf.Store, verbose: boolean): void {
  // Find all Digital Product Passports in the graph
  const dppType = $rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
  const dppClass = $rdf.sym('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0-beta12/DigitalProductPassport');
  
  // Find all subjects that are of type DigitalProductPassport
  const dppStatements = store.statementsMatching(null, dppType, dppClass);
  
  if (dppStatements.length > 0) {
    console.log(chalk.green(`  Found ${dppStatements.length} Digital Product Passport(s) in the graph`));
    
    // For each DPP, find its claims
    for (const dppStatement of dppStatements) {
      const dpp = dppStatement.subject;
      console.log(chalk.cyan(`\n  Digital Product Passport: ${dpp.value}`));
      
      // Find claims related to this DPP
      // First, find the credentialSubject
      const hasCredentialSubject = $rdf.sym('https://www.w3.org/ns/credentials/v2#credentialSubject');
      const subjectStatements = store.statementsMatching(dpp, hasCredentialSubject, null);
      
      if (subjectStatements.length > 0) {
        const credentialSubject = subjectStatements[0].object;
        
        // Find conformityClaim property
        const hasConformityClaim = $rdf.sym('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0-beta12/conformityClaim');
        // Need to check if credentialSubject is a NamedNode or BlankNode before using it
        if (credentialSubject.termType === 'NamedNode' || credentialSubject.termType === 'BlankNode') {
          const claimStatements = store.statementsMatching(credentialSubject, hasConformityClaim, null);
          
          if (claimStatements.length > 0) {
            console.log(chalk.green(`    Found ${claimStatements.length} conformity claim(s)`));
            
            // For each claim, get details
            for (let i = 0; i < claimStatements.length; i++) {
              const claim = claimStatements[i].object;
              console.log(chalk.yellow(`    Claim #${i + 1}:`));
              
              // Get claim properties
              const hasConformityTopic = $rdf.sym('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0-beta12/conformityTopic');
              // Check if claim is a NamedNode or BlankNode
              if (claim.termType === 'NamedNode' || claim.termType === 'BlankNode') {
                const topicStatements = store.statementsMatching(claim, hasConformityTopic, null);
                
                if (topicStatements.length > 0) {
                  console.log(chalk.gray(`      Topic: ${topicStatements[0].object.value}`));
                }
                
                // Get conformance value (true/false)
                const hasConformance = $rdf.sym('https://test.uncefact.org/vocabulary/untp/dpp/0.6.0-beta12/conformance');
                const conformanceStatements = store.statementsMatching(claim, hasConformance, null);
                
                if (conformanceStatements.length > 0) {
                  console.log(chalk.gray(`      Conformance: ${conformanceStatements[0].object.value}`));
                }
              } else {
                console.log(chalk.yellow(`    Claim is not a node that can be queried (type: ${claim.termType})`));
              }
            }
          } else {
            console.log(chalk.yellow('    No conformity claims found'));
          }
        } else {
          console.log(chalk.yellow(`    Credential subject is not a node that can be queried (type: ${credentialSubject.termType})`));
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
      console.log(chalk.green(`  ✓ Successfully added to RDF graph (${result.metadata?.graphNodes || 0} statements)`));
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
    const totalStatements = store.statements.length;
    console.log(chalk.gray(`\n  Total RDF statements in graph: ${totalStatements}`));
    
    if (verbose) {
      console.log(chalk.gray('  Graph namespaces:'));
      const namespaces = new Set<string>();
      
      for (const statement of store.statements) {
        // Extract namespace from URIs
        const extractNamespace = (uri: string) => {
          const hashIndex = uri.lastIndexOf('#');
          const slashIndex = uri.lastIndexOf('/');
          const index = hashIndex > 0 ? hashIndex : slashIndex;
          return index > 0 ? uri.substring(0, index + 1) : uri;
        };
        
        if (statement.subject.termType === 'NamedNode') {
          namespaces.add(extractNamespace(statement.subject.value));
        }
        if (statement.predicate.termType === 'NamedNode') {
          namespaces.add(extractNamespace(statement.predicate.value));
        }
        if (statement.object.termType === 'NamedNode') {
          namespaces.add(extractNamespace(statement.object.value));
        }
      }
      
      namespaces.forEach(ns => console.log(chalk.gray(`    ${ns}`)));
    }
    
    // Save the graph to a file if requested
    if (saveGraph) {
      try {
        const graphFile = 'credential-graph.ttl';
        console.log(chalk.gray(`\n  Saving RDF graph to ${graphFile}...`));
        
        // Serialize the graph to Turtle format
        const serialized = $rdf.serialize(null, store, '', 'text/turtle');
        
        // Write to file (handle potential undefined return value)
        if (serialized !== undefined) {
          fs.writeFileSync(graphFile, serialized);
        } else {
          throw new Error('Failed to serialize RDF graph');
        }
        console.log(chalk.green(`  ✓ Graph saved to ${graphFile}`));
      } catch (error) {
        console.log(chalk.red(`  ✗ Error saving graph: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }
  
  return { validFiles, totalFiles, results };
}
