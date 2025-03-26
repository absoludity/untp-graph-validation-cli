import { Command } from 'commander';
import chalk from 'chalk';
import { ValidationResult } from '../core/types.js';
import { loadFileFromPath } from '../core/utils.js';
import { formatValidationResult } from './formatters.js';
import { tier1Checks } from './tier1.js';

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

          // Perform Tier 1 checks (JSON and JSON-LD validation)
          const checkResult = await tier1Checks(filePath, fileResult.content!, options.verbose);
          
          if (checkResult.valid) {
            validFiles++;
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
