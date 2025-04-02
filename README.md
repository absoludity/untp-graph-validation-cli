# UNTP Credential Validator

A command-line tool and library for validating UN Trade Platform (UNTP) verifiable credentials.

## Features

- **Tier 1 Validation**: Ensures each file is a valid W3C Verifiable Credential with proper JSON-LD structure
- **Tier 2 Validation**: Validates credentials against UNTP-specific schemas and requirements
- **Tier 3 Validation**: Analyzes relationships between credentials using RDF graph validation
  - Verifies product claims against conformity attestations
  - Supports semantic reasoning with N3 queries

## Installation

```bash
# Install globally
npm install -g untp-graph-validation-cli

# Or use with npx
npx untp-graph-validation-cli
```

## Usage

### Command Line

```bash
# Validate a single credential file
untp-validator example-credentials/product-passport-simple.json

# Validate multiple credential files
untp-validator example-credentials/product-passport-simple.json example-credentials/conformity-credential-simple.json

# Validate all credentials in a directory
untp-validator -d example-credentials/

# Show detailed validation information
untp-validator -v example-credentials/product-passport-simple.json

# Save the RDF graph to a file for further analysis
untp-validator --save-graph example-credentials/product-passport-simple.json
```

### As a Library

```javascript
import { validateJSON, validateVerifiableCredential, validateJSONLD } from 'untp-graph-validation-cli';

// Validate a credential
const jsonData = fs.readFileSync('credential.json', 'utf8');
const jsonResult = validateJSON(jsonData);

if (jsonResult.valid) {
  const parsedJSON = jsonResult.metadata.parsedJSON;
  const vcResult = await validateVerifiableCredential(parsedJSON);
  console.log('Validation result:', vcResult.valid);
}
```

## Validation Tiers

### Tier 1: Basic Credential Validation
- JSON syntax validation
- JSON-LD structure validation
- W3C Verifiable Credential schema validation

### Tier 2: UNTP-Specific Validation
- Credential type detection (DPP, DCC, etc.)
- UNTP schema validation
- Required field validation

### Tier 3: Graph-Based Validation
- RDF graph creation from multiple credentials
- Cross-credential relationship validation
- Verification of product claims against conformity attestations

## N3 Queries

The validator uses N3 queries to analyze relationships between credentials:

- `list-product-claims.n3`: Finds all product claims in Digital Product Passports
- `list-verified-product-claims.n3`: Verifies if claims are attested by Digital Conformity Credentials

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/untp-graph-validation-cli.git
cd untp-graph-validation-cli

# Install dependencies
npm install

# Build the project
npm run build

# Run the validator
npm run validate -- example-credentials/product-passport-simple.json
```

## Requirements

- Node.js 16 or higher
- EYE reasoner (for advanced graph validation)

## License

ISC
