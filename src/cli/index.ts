import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { ValidationResult } from '../core/types.js';
import { validateJSON, validateJSONLD } from '../core/tier1Validators.js';
import { printValidationResults } from './formatters.js';

/**
 * Runs the CLI application
 * @param args - Command line arguments
 */
export async function runCLI(args: string[] = process.argv): Promise<void> {
  const program = new Command();
  
  program
    .name('untp-validator')
    .description('CLI tool to validate UNTP credential files')
    .version('0.1.0')
    .argument('<files...>', 'UNTP credential files to validate')
    .option('-v, --verbose', 'display detailed validation information')
    .action(async (files: string[], options) => {
      try {
        console.log(chalk.blue('UNTP Credential Validator'));
        console.log(chalk.gray('Validating the following files:'));
        
        // Process each file individually
        const results = await Promise.all(files.map(async (filePath) => {
          // Check if file exists
          if (!fs.existsSync(filePath)) {
            return {
              filePath,
              result: {
                valid: false,
                errors: [{
                  code: 'FILE_NOT_FOUND',
                  message: `File not found: ${filePath}`
                }],
                warnings: [],
                metadata: { filePath }
              }
            };
          }

          try {
            // Read file content
            const fileContent = fs.readFileSync(filePath, 'utf8');
            
            // Step 1: Validate JSON
            const jsonResult = validateJSON(fileContent);
            
            // If JSON is invalid, return early
            if (!jsonResult.valid) {
              return { filePath, result: jsonResult };
            }
            
            // Step 2: Validate JSON-LD
            const parsedJSON = jsonResult.metadata?.parsedJSON;
            const jsonldResult = await validateJSONLD(parsedJSON);
            
            // Combine results
            const combinedResult: ValidationResult = {
              valid: jsonResult.valid && jsonldResult.valid,
              errors: [...jsonResult.errors, ...jsonldResult.errors],
              warnings: [...jsonResult.warnings, ...jsonldResult.warnings],
              metadata: {
                ...jsonResult.metadata,
                filePath,
                fileSize: fileContent.length,
                validationSteps: {
                  jsonValid: jsonResult.valid,
                  jsonldValid: jsonldResult.valid
                }
              }
            };
            
            return { filePath, result: combinedResult };
          } catch (error) {
            return {
              filePath,
              result: {
                valid: false,
                errors: [{
                  code: 'FILE_PROCESSING_ERROR',
                  message: error instanceof Error ? error.message : 'Unknown error processing file'
                }],
                warnings: [],
                metadata: { filePath }
              }
            };
          }
        }));
        
        printValidationResults(results, options.verbose);
        
        // Ensure we exit cleanly
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('Error during validation:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
  
  await program.parseAsync(args);
}
