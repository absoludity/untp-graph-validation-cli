/**
 * Core types for UNTP credential validation
 */

/**
 * Represents a validation result with errors, warnings and metadata
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata?: Record<string, any>;
}

/**
 * Represents a validation error
 */
export interface ValidationError {
  code: string;
  message: string;
  path?: string;
  error?: any; // The actual error object
}

/**
 * Represents a validation warning
 */
export interface ValidationWarning {
  code: string;
  message: string;
  path?: string;
}

/**
 * Basic structure of a UNTP credential
 */
export interface UNTPCredential {
  type: string[];
  '@context': string[];
  id: string;
  issuer: {
    id: string;
    name?: string;
    type?: string[];
    [key: string]: any;
  };
  validFrom?: string;
  validUntil?: string;
  credentialSubject: {
    type?: string[];
    [key: string]: any;
  };
  [key: string]: any;
}
