import chalk from 'chalk';
import { ValidationResult } from '../core/types.js';
import { createRDFGraph, saveGraphToFiles, listAllProductClaimCriteria, runInferences, getUnattestedIssuersForProduct } from '../core/tier3Validators.js';
import { Store } from 'n3';
import { get } from 'http';

/**
 * Checks product claims in the RDF graph and verifies if they are attested
 * @param store - The N3 Store containing the RDF graph
 * @param verbose - Whether to show verbose output
 * @returns Promise with validation result and details
 */
async function checkProductClaims(
  store: Store,
  verbose: boolean
): Promise<{
  valid: boolean;
  verifiedClaims: number;
  totalClaims: number;
}> {
  if (verbose) {
    console.log(chalk.gray('\n  Checking product claims versus conformance certificate attestations...'));
  }
  let verifiedClaims = 0;
  let totalClaims = 0;

  try {
    if (verbose) {
      console.log(chalk.gray('    Executing query to find product claim criteria...'));
    }

    // Use the listAllProductClaimCriteria function which now includes verification info
    const products = await listAllProductClaimCriteria(store);

    if (verbose) {
      console.log(chalk.gray(`    Found ${products.length} products with claims`));
    }

    // Process the products and their claims
    for (const product of products) {
      console.log(chalk.cyan(`    Product: "${product.name}" (${product.id})`));

      const unattestedIssuers = await getUnattestedIssuersForProduct(store, product.dppId);
      if (unattestedIssuers.length > 0) {
        console.log(chalk.red(`      ⚠ Unattested issuers: ${unattestedIssuers.join(', ')}`));
      } else {
        console.log(chalk.green(`      ✓ All issuers are attested`));
      }

      for (const claim of product.claims) {
        totalClaims++;

        // Check if claim is verified (all criteria verified)
        const isVerified = claim.verified;
        const verifiedCriteria = claim.criteria.filter(c => c.verifiedBy).length;
        const totalCriteria = claim.criteria.length;

        const claimStatus = isVerified ? chalk.green('✓ ') : chalk.red('✗ ');
        const verificationInfo = totalCriteria > 0
          ? chalk.gray(` (${verifiedCriteria}/${totalCriteria} criteria verified)`)
          : '';

        console.log(`      ${claimStatus}${chalk.yellow(`Claim Topic: ${claim.topic}`)}${verificationInfo}`);

        if (claim.criteria.length > 0) {
          console.log(chalk.white(`        Criteria:`));
          for (const criterion of claim.criteria) {
            const hasVerifier = criterion.verifierName;
            const criterionStatus = hasVerifier ? chalk.green('✓ ') : chalk.red('✗ ');
            const verifierInfo = hasVerifier ? chalk.gray(` (verified by ${criterion.verifierName})`) : chalk.red(' (not verified)');

            console.log(`          ${criterionStatus}${chalk.green(criterion.name)}${verifierInfo}`);
          }
        } else {
          // For claims without criteria, show verification status
          if (claim.verified) {
            console.log(chalk.gray(`        Simple claim (verified directly)`));
          } else {
            console.log(chalk.gray(`        No criteria specified for this claim (not verified)`));
          }
        }

        // Count verified claims
        if (isVerified) {
          verifiedClaims++;
        }
      }
    }

    // Add summary
    console.log(chalk.blue(`    Total claims: ${totalClaims}, Verified: ${verifiedClaims}, Unverified: ${totalClaims - verifiedClaims}`));

    return {
      valid: verifiedClaims === totalClaims && totalClaims > 0,
      verifiedClaims,
      totalClaims
    };
  } catch (error) {
    console.log(chalk.red(`    Error checking product claims: ${error instanceof Error ? error.message : String(error)}`));
    return {
      valid: false,
      verifiedClaims: 0,
      totalClaims: 0
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
  console.log(chalk.blue.bold('\nTier 3 testing - analyzing graph of combined credentials'));

  // Create RDF graph from all files
  if (verbose) {
    console.log(chalk.gray('  Creating graph from all credentials...'));
  }
  const { store, results } = await createRDFGraph(filesData);

  // Save the graph to a file if requested
  if (saveGraph) {
    try {
      console.log(chalk.gray('\n  Saving N3 graph to file...'));
      const savedFile = await saveGraphToFiles(store);
      console.log(chalk.green(`  ✓ Graph saved to ${savedFile} (N3 format for eye-reasoner)`));
    } catch (error) {
      console.log(chalk.red(`  ✗ Error saving graph: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  // Count valid files
  let validFiles = 0;
  const totalFiles = Object.keys(results).length;

  for (const [filePath, result] of Object.entries(results)) {
    if (verbose) {
      console.log(chalk.cyan(`\n${filePath}`));
    }

    if (result.valid) {
      if (verbose) {
        console.log(chalk.green(`  ✓ Successfully added named graph ${result.metadata?.graphName} to graph (${result.metadata?.graphNodes || 0} quads)`));
      }
      validFiles++;
    } else {
      console.log(chalk.red('  ✗ Failed to add to graph'));
      result.errors.forEach(error => {
        console.log(chalk.red(`    - ${error.message}`));
      });
    }
  }

  // Only perform graph analysis if ALL files were valid
  if (validFiles === totalFiles && validFiles > 0) {
    // Run inference rules on the graph
    const inferencesSuccess = await runInferences(store);
    if (inferencesSuccess) {
      console.log(chalk.green('  ✓ Successfully applied inference rules to the graph'));
    } else {
      console.log(chalk.red('  ✗ Error applying inference rules to the graph'));
    }

    // Print total graph statistics
    const totalQuads = store.size;
    if (verbose) {
      console.log(chalk.gray('\n  Analyzing graph...'));
      console.log(chalk.gray(`\n  Total RDF quads in graph: ${totalQuads}`));
    }

    // Check product claims
    const claimResults = await checkProductClaims(store, verbose);

    if (claimResults.valid) {
      console.log(chalk.green(`  ✓ All ${claimResults.totalClaims} product claims are verified by attestations`));
    } else if (claimResults.totalClaims === 0) {
      console.log(chalk.yellow('  ⚠ No product claims found in the credentials'));
    } else {
      console.log(chalk.yellow(`  ⚠ The criteria for ${claimResults.verifiedClaims} of ${claimResults.totalClaims} product claims are verified by attestations`));
    }
  } else if (validFiles > 0) {
    console.log(chalk.yellow(`  ⚠ Skipping graph analysis because ${totalFiles - validFiles} of ${totalFiles} files failed validation`));
  } else {
    console.log(chalk.red(`  ✗ Cannot perform graph analysis because all ${totalFiles} files failed validation`));
  }

  return { validFiles, totalFiles, results };
}
