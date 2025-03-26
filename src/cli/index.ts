import { Command } from 'commander';
import chalk from 'chalk';
import { validateUNTPCredentialsFromPaths } from '../core/utils.js';
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
        
        // Single call to validate all files and their relationships
        const results = await validateUNTPCredentialsFromPaths(files);
        
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
