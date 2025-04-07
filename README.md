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

- `list-product-claims.n3`: Finds all product claims in Digital Product Passports (this doesn't do any relationship analysis, but is a basic query to demonstrate something simple),
- `list-verified-product-claims.n3`: Verifies if claims are attested by Digital Conformity Credentials

## Developing and Testing N3 Queries

This section explains how to develop and test N3 queries for the UNTP credential validation tool. The tool uses the EYE reasoner to execute N3 queries against RDF graphs generated from UNTP credentials.

### Query Development Workflow

The validation tool is designed to support an iterative query development workflow:

1. **Generate an RDF graph** from your credentials using the validation tool
2. **Develop and test queries** directly using the EYE reasoner CLI
3. **Integrate your queries** into the validation tool

### Generating RDF Graphs

To generate an RDF graph from your credentials, use the `--save-graph` option:

```bash
npm run validate -- --dir example-credentials --save-graph
```

This will create a file named `credential-graph.n3` in the current directory containing all the RDF triples from your credentials.

### Testing Queries with EYE Reasoner

Once you have an RDF graph, you can test your queries directly using the EYE reasoner CLI:

```bash
eyereasoner --nope --quiet --strings credential-graph.n3 src/core/queries/list-product-claims.n3
```

This will execute the query and display human-readable output using the `log:outputString` statements in the query.

Example output:
```
The product EV battery 300Ah (<https://id.gs1.org/01/09520123456788/21/12345>) claims to conform to the criteria "GBA Battery rule book v2.0 battery assembly guidelines" (topic <https://test.uncefact.org/vocabulary/untp/core/0/conformityTopicCode#environment.emissions>)

The product EV battery 300Ah (<https://id.gs1.org/01/09520123456788/21/12345>) claims to conform to the criteria "GBA Battery rule book v2.0 battery disposal guidelines" (topic <https://test.uncefact.org/vocabulary/untp/core/0/conformityTopicCode#environment.waste>)
```

To test the verification of claims:

```bash
eyereasoner --nope --quiet --strings credential-graph.n3 src/core/queries/list-verified-product-claims.n3
```

Example output:
```
The product "EV battery 300Ah" (<https://id.gs1.org/01/09520123456788/21/12345>) has a claim (topic: <https://test.uncefact.org/vocabulary/untp/core/0/conformityTopicCode#environment.emissions>) that was attested to by Electronic Certifier Pty Ltd.
```

### Query Structure

Queries should be structured to produce both:

1. **Human-readable output** using `log:outputString` for easy iterating and use from eyereasoner, and
2. **RDF triples** for programmatic use by the validation tool

Example query structure:
```n3
{
  # Query pattern to match data
  ?product schemaorg:name ?productName .
  ?product untp:hasClaim ?claim .

  # Format human-readable output
  ( "Product " ?productName " has claim " ?claim ) string:concatenation ?output .
}
=>
{
  # Human-readable output for CLI use with --strings
  ?productName log:outputString ?output .

  # RDF triples for programmatic use
  ?product result:hasClaim ?claim .
  ?claim result:type "example" .
}
```

### Adding New Queries

To add a new query:

1. Create a new `.n3` file in the `src/core/queries` directory
2. Follow the query structure above, providing both human-readable output and RDF triples
3. Test your query using the EYE reasoner CLI
4. Update the validation tool to use your query by adding it to the `queryNames` array in `executeQueriesOnGraph` function

### Debugging Queries

When developing queries, you can:

- Use the `--strings` option to see human-readable output
- Omit the `--quiet` option to see more detailed output from the reasoner
- Use the `--pass-all` option to see all triples, including input triples
- Use the `--debug` option for even more detailed debugging information

### Query Options Reference

Common EYE reasoner options:

- `--nope`: Disable proof explanation (makes output cleaner)
- `--quiet`: Suppress informational messages
- `--strings`: Show string output from `log:outputString` statements
- `--pass-only-new`: Only output derived triples (not input triples)

For more options, see the [EYE reasoner documentation](https://github.com/eyereasoner/eye).

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
