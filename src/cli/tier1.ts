import chalk from 'chalk';
import { ValidationResult } from '../core/types.js';
import { validateJSON, validateJSONLD, validateVerifiableCredential } from '../core/tier1Validators.js';
import { printValidationResult } from './formatters.js';
import { loadFileFromPath } from './utils.js';

/**
 * Performs Tier 1 validation checks on multiple files
 * @param filePaths - Array of paths to files being validated
 * @param verbose - Whether to show verbose output
 * @returns Object with validation summary and parsed data
 */
export async function tier1ChecksForFiles(
  filePaths: string[],
  verbose: boolean
): Promise<{
  validFiles: number;
  totalFiles: number;
  data: Record<string, any>;
}> {

  console.log(chalk.blue.bold('\nTier 1 testing - ensuring each file is a valid VerifiableCredential'));

  let validFiles = 0;
  const totalFiles = filePaths.length;
  const data: Record<string, any> = {};

  for (const filePath of filePaths) {
    console.log(chalk.cyan(`\n${filePath}`));

    const { valid, data: parsedJSON } = await tier1ChecksForFile(filePath, verbose);

    if (valid) {
      validFiles++;
      data[filePath] = parsedJSON;
    }
  }

  return { validFiles, totalFiles, data };
}

/**
 * Performs Tier 1 validation checks (JSON and JSON-LD) on a file
 * @param filePath - Path to the file being validated
 * @param verbose - Whether to show verbose output
 * @returns Object with validation status, valid flag, and parsed data when successful
 */
export async function tier1ChecksForFile(
  filePath: string,
  verbose: boolean
): Promise<{ valid: boolean; data: any }> {
  // Load file
  const { success, content } = loadFileFromPath(filePath);

  // If file loading failed, return early
  if (!success) {
    return { valid: false, data: {} };
  }

  try {
    // Step 1: Validate JSON
    const jsonResult = validateJSON(content);

    // Print JSON validation result
    if (jsonResult.valid) {
      console.log(chalk.green('  ✓ JSON validation successful'));
    } else {
      console.log(chalk.red('  ✗ JSON validation failed'));
      jsonResult.errors.forEach(error => {
        console.log(chalk.red(`    - ${error.message}`));
      });

      // Add filePath to metadata before printing
      jsonResult.metadata = { ...jsonResult.metadata, filePath };
      printValidationResult(jsonResult, verbose);
      return { valid: false, data: {} };
    }

    // Step 2: Validate JSON-LD
    const parsedJSON = jsonResult.metadata?.parsedJSON;
    const jsonldResult = await validateJSONLD(parsedJSON);

    // Print JSON-LD validation result
    if (jsonldResult.valid) {
      console.log(chalk.green('  ✓ JSON-LD validation successful'));
    } else {
      console.log(chalk.red('  ✗ JSON-LD validation failed'));
      jsonldResult.errors.forEach(error => {
        console.log(chalk.red(`    - ${error.message}`));
      });
      
      // Add hint about verbose mode
      if (!verbose) {
        console.log(chalk.yellow('    Run with --verbose for more detailed error information'));
      } else {
        // Print detailed error information in verbose mode
        console.log(chalk.yellow('    Detailed JSON-LD errors:'));
        jsonldResult.errors.forEach(error => {
          console.log(chalk.yellow(`    ${JSON.stringify(error, null, 2)}`));
        });
      }
      
      return { valid: false, data: {} };
    }

    // Step 3: Validate Verifiable Credential structure
    const vcResult = await validateVerifiableCredential(parsedJSON);

    // Print VC validation result
    if (vcResult.valid) {
      console.log(chalk.green('  ✓ Verifiable Credential Schema validation successful'));
    } else {
      console.log(chalk.red('  ✗ Verifiable Credential Schema validation failed'));
      vcResult.errors.forEach(error => {
        console.log(chalk.red(`    - ${error.message}`));
      });
    }

    return {
      valid: vcResult.valid,
      data: vcResult.valid ? parsedJSON : {}
    };
  } catch (error) {
    // Handle unexpected errors during validation
    const errorResult: ValidationResult = {
      valid: false,
      errors: [{
        code: 'FILE_PROCESSING_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error processing file'
      }],
      warnings: [],
      metadata: { filePath }
    };

    printValidationResult(errorResult, verbose);
    return { valid: false, data: {} };
  }
}
