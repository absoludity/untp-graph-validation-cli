import { Command } from 'commander';
import chalk from 'chalk';
import { tier1ChecksForFiles } from './tier1.js';

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
        const { validFiles, totalFiles } = await tier1ChecksForFiles(files, options.verbose);

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
