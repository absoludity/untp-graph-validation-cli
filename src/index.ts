#!/usr/bin/env node

/**
 * Main entry point for the UNTP validator library
 * Exports the public API and runs the CLI if executed directly
 */

// Export public API
export * from './core/types.js';
export * from './core/validators.js';
export * from './core/utils.js';
export { runCLI } from './cli/index.js';

// Run CLI if this file is executed directly or via npm binary
const isRunningAsCLI = process.argv[1] === import.meta.url.substring(7) || // Direct node execution
                       process.argv[1].endsWith('untp-validator') ||       // Binary execution
                       process.argv[1].endsWith('untp-graph-validation-cli/dist/index.js'); // npm link execution

if (isRunningAsCLI) {
  import('./cli/index.js').then(({ runCLI }) => {
    runCLI().catch(error => {
      console.error('Error running CLI:', error);
      process.exit(1);
    });
  }).catch(error => {
    console.error('Failed to load CLI module:', error);
    process.exit(1);
  });
}
