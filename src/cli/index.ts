import { Command } from 'commander';
import chalk from 'chalk';
import { tier1ChecksForFiles } from './tier1.js';
import { tier2ChecksForFiles } from './tier2.js';
import { tier3ChecksForGraph } from './tier3.js';
import { getJsonFilesFromDirectory } from './utils.js';

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
    .option('-v, --verbose', 'display detailed validation information')
    .option('-d, --dir <directory>', 'validate all JSON and JSONLD files in the specified directory')
    .option('--save-graph', 'save the RDF graph to a file (credential-graph.ttl)')
    .argument('[files...]', 'UNTP credential files to validate')
    .action(async (files: string[], options) => {
      try {
        console.log(chalk.blue('UNTP Credential Validator'));

        // If directory option is provided, get all JSON files from that directory
        if (options.dir) {
          const dirFiles = getJsonFilesFromDirectory(options.dir);
          if (dirFiles.length === 0) {
            console.log(chalk.yellow(`No JSON or JSONLD files found in directory: ${options.dir}`));
            process.exit(1);
          }

          // Combine with any explicitly specified files
          files = [...files, ...dirFiles];
          console.log(chalk.gray(`Found ${dirFiles.length} JSON/JSONLD files in directory: ${options.dir}`));
        }

        // Ensure we have at least one file to validate
        if (files.length === 0) {
          console.log(chalk.red('No files specified for validation. Use --dir option or provide file paths.'));
          process.exit(1);
        }

        console.log(chalk.gray(`Validating ${files.length} files...`));

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

        // Proceed to Tier 3 checks if all files passed Tier 2
        const tier3Result = await tier3ChecksForGraph(data, options.verbose, options.saveGraph);

        // Check if all files were successfully added to the graph
        if (tier3Result.validFiles !== tier3Result.totalFiles) {
          console.log(chalk.red(`\n✗ ${tier3Result.totalFiles - tier3Result.validFiles} of ${tier3Result.totalFiles} files failed to be added to the RDF graph.`));
          process.exit(1);
        }

        console.log(chalk.green('\nTier 3 checks of graph complete.'));

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
