import fs from 'fs';
import chalk from 'chalk';
import { printValidationResult } from './formatters.js';
import { ValidationResult } from '../core/types.js';

/**
 * Loads a file from the given path, prints any errors directly, and returns a simple result
 * @param filePath - Path to the file to load
 * @returns Object with success flag and content if successful
 */
export function loadFileFromPath(filePath: string): { 
  success: boolean; 
  content?: string;
} {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      const result: ValidationResult = {
        valid: false,
        errors: [{
          code: 'FILE_NOT_FOUND',
          message: `File not found: ${filePath}`
        }],
        warnings: [],
        metadata: { filePath }
      };
      
      console.log(chalk.red(`  ✗ File not found: ${filePath}`));
      printValidationResult(result, false);
      return { success: false };
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    const result: ValidationResult = {
      valid: false,
      errors: [{
        code: 'FILE_READ_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error reading file'
      }],
      warnings: [],
      metadata: { filePath }
    };
    
    console.log(chalk.red(`  ✗ Error reading file: ${filePath}`));
    printValidationResult(result, false);
    return { success: false };
  }
}
