/**
 * Core types for UNTP credential validation
 */

/**
 * Enumerates the different UNTP credential types.
 */
export enum CredentialType {
  DigitalProductPassport = 'DigitalProductPassport',
  DigitalConformityCredential = 'DigitalConformityCredential',
  DigitalFacilityRecord = 'DigitalFacilityRecord',
  DigitalIdentityAnchor = 'DigitalIdentityAnchor',
  DigitalTraceabilityEvent = 'DigitalTraceabilityEvent',
}

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
