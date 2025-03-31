import chalk from 'chalk';
import { ValidationResult } from '../core/types.js';
import { createRDFGraph, saveGraphToFiles } from '../core/tier3Validators.js';

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
    
    // TODO: Use eye notation queries for credentials etc.

    if (verbose) {
      // TODO: Use this for something interesting.
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
