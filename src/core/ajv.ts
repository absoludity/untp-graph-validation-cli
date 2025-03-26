import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import chalk from 'chalk';

// Import the meta-schemas from Ajv
import draft2020Schema from 'ajv/dist/refs/json-schema-2020-12/schema.json' with { type: 'json' };
import draft2019Schema from 'ajv/dist/refs/json-schema-2019-09/schema.json' with { type: 'json' };
import draft7Schema from 'ajv/dist/refs/json-schema-draft-07.json' with { type: 'json' };

// Import additional meta-schema files needed for 2020-12
import metaCore from 'ajv/dist/refs/json-schema-2020-12/meta/core.json' with { type: 'json' };
import metaApplicator from 'ajv/dist/refs/json-schema-2020-12/meta/applicator.json' with { type: 'json' };
import metaValidation from 'ajv/dist/refs/json-schema-2020-12/meta/validation.json' with { type: 'json' };
import metaMetaData from 'ajv/dist/refs/json-schema-2020-12/meta/meta-data.json' with { type: 'json' };
import metaFormat from 'ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json' with { type: 'json' };
import metaContent from 'ajv/dist/refs/json-schema-2020-12/meta/content.json' with { type: 'json' };
import metaUnevaluated from 'ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json' with { type: 'json' };

// Schema cache to prevent repeated fetching
const schemaCache = new Map<string, any>();

// Create and configure Ajv instance
const ajv = new Ajv.default({
  allErrors: true,
  verbose: true,
  // Disable strict mode to allow keywords like $dynamicAnchor
  strict: false,
  // Cache schemas by default
  schemaId: '$id',
  // Explicitly disable schema validation to prevent meta-schema validation issues
  validateSchema: false,
  loadSchema: async (uri: string) => {
    // Check if the URI is a meta-schema - these are now pre-loaded
    if (uri.startsWith('https://json-schema.org/draft/')) {
      return; // Let Ajv use the pre-loaded schema
    }

    // Check if we already have this schema in our custom cache
    if (schemaCache.has(uri)) {
      return schemaCache.get(uri);
    }
    try {
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Failed to load schema from ${uri}: ${response.statusText}`);
      }
      const schema = await response.json();

      // Cache the schema for future use
      schemaCache.set(uri, schema);

      return schema;
    } catch (error) {
      console.error(`Error loading schema from ${uri}:`, error);
      throw error;
    }
  }
});

// Add support for formats
addFormats.default(ajv);

// Add the meta-schemas to Ajv only if they're not already loaded
try {
  // Add 2020-12 meta-schemas
  if (!ajv.getSchema('https://json-schema.org/draft/2020-12/schema')) {
    ajv.addMetaSchema(draft2020Schema);
    ajv.addMetaSchema(metaCore);
    ajv.addMetaSchema(metaApplicator);
    ajv.addMetaSchema(metaValidation);
    ajv.addMetaSchema(metaMetaData);
    ajv.addMetaSchema(metaFormat);
    ajv.addMetaSchema(metaContent);
    ajv.addMetaSchema(metaUnevaluated);
  }

  // Add other meta-schemas
  if (!ajv.getSchema('https://json-schema.org/draft/2019-09/schema')) {
    ajv.addMetaSchema(draft2019Schema);
  }
  if (!ajv.getSchema('http://json-schema.org/draft-07/schema')) {
    ajv.addMetaSchema(draft7Schema);
  }
} catch (error) {
  console.warn(chalk.yellow('  Error adding meta-schemas, they may already be loaded:'), error);
}

// Cache for compiled validators
const validatorCache = new Map<string, any>();

/**
 * Gets a validator for the specified schema URL
 * @param schemaUrl - URL of the schema to validate against
 * @returns Promise with the validator function
 */
export async function getValidator(schemaUrl: string): Promise<any> {
  // Check if we have a cached validator for this schema
  let validate = validatorCache.get(schemaUrl);

  if (!validate) {
    // Compile the schema
    validate = await ajv.compileAsync({ $ref: schemaUrl });
    validatorCache.set(schemaUrl, validate);
  }

  return validate;
}

// Export the Ajv instance for direct use if needed
export { ajv };
