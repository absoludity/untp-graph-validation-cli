import chalk from 'chalk';
import { ValidationResult } from '../core/types.js';
import { validateJSON, validateJSONLD } from '../core/tier1Validators.js';
import { printValidationResult } from './formatters.js';

/**
 * Performs Tier 1 validation checks (JSON and JSON-LD) on file content
 * @param filePath - Path to the file being validated (for reporting)
 * @param fileContent - Content of the file to validate
 * @param verbose - Whether to show verbose output
 * @returns Object with validation status and valid flag
 */
export async function tier1Checks(
  filePath: string,
  fileContent: string,
  verbose: boolean
): Promise<{ valid: boolean }> {
  try {
    // Step 1: Validate JSON
    const jsonResult = validateJSON(fileContent);

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
      return { valid: false };
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
    }

    return { valid: jsonldResult.valid };
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
    return { valid: false };
  }
}
