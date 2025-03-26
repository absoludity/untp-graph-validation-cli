import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Loads a file from the given path, prints any errors directly, and returns a simple result
 * @param filePath - Path to the file to load
 * @returns Object with success flag and content if successful
 */
export function loadFileFromPath(filePath: string): {
  success: boolean;
  content: string;
} {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red(`  ✗ File not found: ${filePath}`));
      return { success: false, content: '' };
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    console.log(chalk.red(`  ✗ Error reading file: ${filePath}`));
    return { success: false, content: '' };
  }
}

/**
 * Gets all JSON and JSONLD files from a directory
 * @param directory - Directory to scan
 * @returns Array of file paths
 */
export function getJsonFilesFromDirectory(directory: string): string[] {
  try {
    if (!fs.existsSync(directory)) {
      console.log(chalk.red(`Directory not found: ${directory}`));
      return [];
    }

    const files = fs.readdirSync(directory);
    return files
      .filter(file => file.endsWith('.json') || file.endsWith('.jsonld'))
      .map(file => path.join(directory, file));
  } catch (error) {
    console.log(chalk.red(`Error reading directory: ${error instanceof Error ? error.message : String(error)}`));
    return [];
  }
}
