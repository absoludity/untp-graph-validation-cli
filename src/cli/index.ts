import { Command } from 'commander';
import chalk from 'chalk';
import { tier1ChecksForFiles } from './tier1.js';
import { tier2ChecksForFiles } from './tier2.js';

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

        // Perform Tier 1 checks on all files
        const { validFiles, totalFiles, data } = await tier1ChecksForFiles(files, options.verbose);

        // Check if all files passed Tier 1 tests
        if (validFiles !== totalFiles) {
          console.log(chalk.red(`\n✗ ${totalFiles - validFiles} of ${totalFiles} files failed Tier 1 tests. Exiting.`));
          process.exit(1);
        }

        console.log(chalk.green('\n✓ All files passed Tier 1 tests (valid VerifiableCredentials)'));

        // Proceed to Tier 2 checks if all files passed Tier 1
        const tier2Result = await tier2ChecksForFiles(data, options.verbose);
        
        // Check if all files passed Tier 2 tests
        if (tier2Result.validFiles !== tier2Result.totalFiles) {
          console.log(chalk.red(`\n✗ ${tier2Result.totalFiles - tier2Result.validFiles} of ${tier2Result.totalFiles} files failed Tier 2 tests.`));
          process.exit(1);
        }
        
        console.log(chalk.green('\n✓ All files passed Tier 2 tests (valid UNTP credentials)'));

        // Exit with success code if we got here (all files passed)
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('Error during validation:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  await program.parseAsync(args);
}
