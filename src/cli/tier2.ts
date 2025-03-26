import chalk from 'chalk';
import { validateUNTPCredential } from '../core/tier2Validators.js';
import { ValidationResult } from '../core/types.js';
import { getCredentialType } from '../core/utils.js';

/**
 * Performs Tier 2 validation checks on multiple files
 * @param filesData - Dictionary of file paths to parsed JSON data
 * @param verbose - Whether to show verbose output
 * @returns Object with validation summary and results
 */
export async function tier2ChecksForFiles(
    filesData: Record<string, any>,
    verbose: boolean
): Promise<{
    validFiles: number;
    totalFiles: number;
    results: Record<string, ValidationResult>;
}> {
    console.log(chalk.blue.bold('\nTier 2 testing - ensuring each file is a valid UNTP credential'));

    let validFiles = 0;
    const totalFiles = Object.keys(filesData).length;
    const results: Record<string, ValidationResult> = {};

    for (const [filePath, data] of Object.entries(filesData)) {
        console.log(chalk.cyan(`\n${filePath}`));

        try {
            // Validate UNTP credential structure
            const result = await validateUNTPCredential(data);

            // Store the result
            results[filePath] = result;

            // Print validation result
            if (result.valid) {
                // Get the credential type
                const credentialType = getCredentialType(data);
                const issuer = data.issuer?.name || data.issuer?.id || 'Unknown issuer';

                console.log(chalk.green(`  ✓ UNTP credential validation successful for ${credentialType} issued by ${issuer}`));

                validFiles++;
            } else {
                console.log(chalk.red('  ✗ UNTP credential validation failed'));
                result.errors.forEach(error => {
                    console.log(chalk.red(`    - ${error.message}`));
                });

                // Print warnings if any
                if (result.warnings.length > 0) {
                    console.log(chalk.yellow('  Warnings:'));
                    result.warnings.forEach(warning => {
                        console.log(chalk.yellow(`    - ${warning.message}`));
                    });
                }

                // Add hint about verbose mode
                if (!verbose && result.errors.length > 0) {
                    console.log(chalk.yellow('    Run with --verbose for more detailed error information'));
                } else if (verbose && result.errors.length > 0) {
                    // Print detailed error information in verbose mode
                    console.log(chalk.yellow('    Detailed validation errors:'));
                    result.errors.forEach(error => {
                        if (error.error) {
                            console.log(chalk.yellow(`    ${JSON.stringify(error.error, null, 2)}`));
                        }
                    });
                }
            }
        } catch (error) {
            console.log(chalk.red(`  ✗ Error validating UNTP credential: ${error instanceof Error ? error.message : String(error)}`));

            // Create an error result
            const errorResult: ValidationResult = {
                valid: false,
                errors: [{
                    code: 'VALIDATION_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error during validation'
                }],
                warnings: [],
                metadata: { filePath }
            };

            results[filePath] = errorResult;
        }
    }

    return { validFiles, totalFiles, results };
}
