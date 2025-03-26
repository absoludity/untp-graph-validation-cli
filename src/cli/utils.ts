import fs from 'fs';
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
