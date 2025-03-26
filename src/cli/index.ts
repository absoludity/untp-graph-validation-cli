import { Command } from 'commander';
import chalk from 'chalk';
import { ValidationResult } from '../core/types.js';
import { validateJSON, validateJSONLD } from '../core/tier1Validators.js';
import { loadFileFromPath } from '../core/utils.js';
import { formatValidationResult } from './formatters.js';

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
        
        let validFiles = 0;
        const totalFiles = files.length;
        
        // Process each file individually
        for (const filePath of files) {
          console.log(chalk.cyan(`\nValidating: ${filePath}`));
          
          // Load file using the utility function
          const fileResult = loadFileFromPath(filePath);
          
          // If file loading failed, print the error and continue
          if (!fileResult.success) {
            const formattedOutput = formatValidationResult(
              filePath, 
              fileResult.validationResult!.result, 
              options.verbose
            );
            formattedOutput.forEach(line => console.log(line));
            continue;
          }

          try {
            // Step 1: Validate JSON
            console.log(chalk.gray('  Validating JSON...'));
            const jsonResult = validateJSON(fileResult.content!);
            
            // Print JSON validation result
            if (jsonResult.valid) {
              console.log(chalk.green('  ✓ JSON validation successful'));
            } else {
              console.log(chalk.red('  ✗ JSON validation failed'));
              jsonResult.errors.forEach(error => {
                console.log(chalk.red(`    - ${error.message}`));
              });
              
              // Print full validation result for this file
              const combinedResult: ValidationResult = {
                valid: false,
                errors: jsonResult.errors,
                warnings: jsonResult.warnings,
                metadata: {
                  ...jsonResult.metadata,
                  filePath,
                  fileSize: fileResult.content!.length,
                  validationSteps: {
                    jsonValid: false
                  }
                }
              };
              
              const formattedOutput = formatValidationResult(filePath, combinedResult, options.verbose);
              formattedOutput.forEach(line => console.log(line));
              continue;
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
            
            // Combine results
            const combinedResult: ValidationResult = {
              valid: jsonResult.valid && jsonldResult.valid,
              errors: [...jsonResult.errors, ...jsonldResult.errors],
              warnings: [...jsonResult.warnings, ...jsonldResult.warnings],
              metadata: {
                ...jsonResult.metadata,
                filePath,
                fileSize: fileResult.content!.length,
                validationSteps: {
                  jsonValid: jsonResult.valid,
                  jsonldValid: jsonldResult.valid
                }
              }
            };
            
            // Print full validation result for this file
            const formattedOutput = formatValidationResult(filePath, combinedResult, options.verbose);
            formattedOutput.forEach(line => console.log(line));
            
            // Update valid files count
            if (combinedResult.valid) {
              validFiles++;
            }
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
            
            const formattedOutput = formatValidationResult(filePath, errorResult, options.verbose);
            formattedOutput.forEach(line => console.log(line));
          }
        }
        
        // Print summary at the end
        console.log(chalk.blue('\nValidation Summary:'));
        console.log(`Total files: ${totalFiles}`);
        console.log(`Valid files: ${validFiles}`);
        console.log(`Invalid files: ${totalFiles - validFiles}`);
        
        // Exit with appropriate code
        process.exit(validFiles === totalFiles ? 0 : 1);
      } catch (error) {
        console.error(chalk.red('Error during validation:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
  
  await program.parseAsync(args);
}
