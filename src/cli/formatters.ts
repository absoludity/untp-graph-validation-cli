import chalk from 'chalk';
import path from 'path';
import { ValidationResult } from '../core/types.js';

/**
 * Formats a validation result for CLI output
 * @param result - Validation result to format
 * @param verbose - Whether to include verbose output
 * @returns Array of formatted output lines
 */
export function formatValidationResult(result: ValidationResult, verbose: boolean): string[] {
  const output: string[] = [];
  const filePath = result.metadata?.filePath || 'unknown';
  const fileName = path.basename(filePath);

  // Add detailed validation status
  if (result.metadata?.parsedJSON) {
    output.push(chalk.green(`✓ ${fileName}: Valid JSON format`));

    // Check if JSON-LD validation was performed and passed
    if (result.metadata.validationSteps?.jsonldValid) {
      output.push(chalk.green(`✓ ${fileName}: Valid JSON-LD format`));
    } else if (result.metadata.validationSteps?.jsonldValid === false) {
      output.push(chalk.red(`✗ ${fileName}: Invalid JSON-LD format`));
    }

    // Check if it has basic UNTP structure
    const hasBasicStructure =
      result.metadata.parsedJSON.type &&
      result.metadata.parsedJSON['@context'] &&
      result.metadata.parsedJSON.credentialSubject;

    if (hasBasicStructure) {
      output.push(chalk.green(`✓ ${fileName}: Contains basic UNTP structure`));
    } else {
      output.push(chalk.yellow(`⚠ ${fileName}: Missing some UNTP required fields`));
    }

    // Add overall validation status
    if (result.valid) {
      output.push(chalk.green(`✓ ${fileName}: Valid UNTP credential`));
    } else {
      output.push(chalk.red(`✗ ${fileName}: Invalid UNTP credential`));
    }
  } else {
    output.push(chalk.red(`✗ ${fileName}: Invalid JSON format`));
  }

  // Add errors
  if (result.errors.length > 0) {
    output.push(chalk.red(`  Errors (${result.errors.length}):`));
    result.errors.forEach(error => {
      output.push(chalk.red(`  • ${error.message}`));

      // If there's an error object and verbose mode is on, pretty print it
      if (verbose && error.error) {
        try {
          const errorJson = JSON.stringify(error.error, null, 2);
          output.push(chalk.gray(`    Details: ${errorJson}`));
        } catch {
          // If error can't be stringified, show what we can
          output.push(chalk.gray(`    Details: ${String(error.error)}`));
        }
      }
    });
  }

  // Add warnings
  if (result.warnings.length > 0) {
    output.push(chalk.yellow(`  Warnings (${result.warnings.length}):`));
    result.warnings.forEach(warning => {
      output.push(chalk.yellow(`  • ${warning.message}`));
    });
  }

  // Add verbose information if requested
  if (verbose && result.metadata) {
    output.push(chalk.blue('  File details:'));

    if (result.metadata.filePath) {
      output.push(chalk.gray(`  • Path: ${path.resolve(result.metadata.filePath)}`));
    }

    if (result.metadata.fileSize !== undefined) {
      output.push(chalk.gray(`  • Size: ${result.metadata.fileSize} bytes`));
    }

    if (result.metadata.credentialType) {
      output.push(chalk.gray(`  • Credential type: ${result.metadata.credentialType}`));
    }

    if (result.metadata.issuer) {
      output.push(chalk.gray(`  • Issuer: ${result.metadata.issuer}`));
    }
  }

  return output;
}

/**
 * Prints a single validation result to the console
 * @param result - Validation result to print
 * @param verbose - Whether to include verbose output
 */
export function printValidationResult(result: ValidationResult, verbose: boolean): void {
  const formattedOutput = formatValidationResult(result, verbose);
  formattedOutput.forEach(line => console.log(line));
}

/**
 * Prints multiple validation results to the console
 * @param results - Array of validation results to print
 * @param verbose - Whether to include verbose output
 */
export function printValidationResults(results: Array<{ filePath: string; result: ValidationResult }>, verbose: boolean): void {
  results.forEach(({ result }) => {
    printValidationResult(result, verbose);
    console.log(''); // Add empty line between files
  });

  // Print summary
  const totalFiles = results.length;
  const validFiles = results.filter(r => r.result.valid).length;
  const invalidFiles = totalFiles - validFiles;

  console.log(chalk.blue('Summary:'));
  console.log(chalk.blue(`  Total files: ${totalFiles}`));
  console.log(chalk.green(`  Valid files: ${validFiles}`));

  if (invalidFiles > 0) {
    console.log(chalk.red(`  Invalid files: ${invalidFiles}`));
  } else {
    console.log(chalk.green(`  Invalid files: ${invalidFiles}`));
  }
}
