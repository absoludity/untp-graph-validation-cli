import { ValidationResult } from './types.js';
import { getSchemaUrlForCredential, validateJsonAgainstSchema } from './utils.js';

/**
 * Validates if a parsed JSON object conforms to UNTP credential structure using JSON Schema
 * @param credential - Object to validate as UNTP credential
 * @returns Promise<ValidationResult> with UNTP validation results
 */
export async function validateUNTPCredential(credential: any): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: {
      credentialType: credential.type?.join(', ') || 'Not specified',
      issuer: credential.issuer?.name || credential.issuer?.id || 'Not specified'
    }
  };

  // Get schema URL
  const schemaUrl = getSchemaUrlForCredential(credential);
  if (!schemaUrl) {
    result.warnings.push({
      code: 'SCHEMA_NOT_FOUND',
      message: 'Could not determine schema URL from credential context'
    });
    return result;
  }

  // Validate against the schema
  return await validateJsonAgainstSchema(credential, schemaUrl);
}
