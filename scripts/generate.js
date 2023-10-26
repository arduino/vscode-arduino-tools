// @ts-check

// Generates schemas and types for cortex-debug and debug_custom.json.
// Usage: `node ./scripts/generate.js 1.5.1`

const fs = require('node:fs/promises');
const path = require('node:path');
const { compile } = require('json-schema-to-typescript');
const temp = require('temp');
const { download, decompress } = require('./utils');

const [version] = process.argv.slice(2);
if (!version) {
  console.error("The 'cortex-debug' VSIX version argument must be specified.");
  process.exit(1);
}

/**
 * @typedef {import('json-schema').JSONSchema4} JSONSchema4
 * @typedef {{ items: JSONSchema4 | JSONSchema4[] | undefined | string }} RelaxedItems
 * @typedef {{ properties: RelaxedJSONSchema4 | RelaxedJSONSchema4[] | undefined }} RelaxedProperties
 * @typedef {Omit<JSONSchema4, 'items' | 'properties'> & RelaxedItems & RelaxedProperties} RelaxedJSONSchema4
 */

const cortexDebugTitle = 'cortex-debug Launch Attributes';
const customDebugTitle = 'debug_custom.json configuration';

/**
 * @param {string} version the semver of the cortex-debug extension to download and generate from.
 * @param {string} tempDir absolute filesystem path for the working directory.
 */
async function generate(version, tempDir) {
  await downloadVSIX(version, tempDir);
  const properties = getLaunchAttributes(tempDir);
  const cortexDebugSchema = await generateCortexDebugSchema(properties);
  await generateTS(version, cortexDebugSchema);
  await generateCustomDebugSchema(cortexDebugSchema);
}

/**
 * Generates the JSON schema for debug_custom.json so IDE2 can validate via [jsonValidation](https://code.visualstudio.com/api/references/contribution-points#contributes.jsonValidation).
 *
 * @param {JSONSchema4} superSchema
 * @returns {Promise<void>}
 */
async function generateCustomDebugSchema(superSchema) {
  const schemaPath = path.join(__dirname, '..', 'schemas', 'debug-custom.json');
  console.log(`Generating JSON-schema for 'custom-debug'  to ${schemaPath}`);
  /** @type {JSONSchema4} */
  const schema = {
    title: customDebugTitle,
    $schema: 'http://json-schema.org/draft-06/schema#',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        ...superSchema.properties,
        configId: {
          type: 'string',
          description:
            'Arduino debug configuration identifier consisting of the Fully Qualified Board Name (FQBN) and the programmer identifier (for example, `esptool`)',
          examples: ['vendor:arch:boardId:programmer=programmerId'],
        },
      },
      required: ['configId'],
    },
  };
  await writeSchema(schema, schemaPath);
}

/**
 * @param {RelaxedJSONSchema4} properties
 * @returns {Promise<JSONSchema4>}
 */
async function generateCortexDebugSchema(properties) {
  const schemaPath = path.join(__dirname, '..', 'schemas', 'cortex-debug.json');
  console.log(`Generating JSON-schema for 'cortex-debug' to ${schemaPath}`);
  const schema = fixSchema({
    title: cortexDebugTitle,
    $schema: 'http://json-schema.org/draft-06/schema#',
    ...properties,
  });
  await writeSchema(schema, schemaPath);
  return schema;
}

/**
 * @param {string} file path to file to format
 */
async function format(file) {
  const { execa } = await import('execa');
  await execa('npx', ['prettier', '--write', file], {
    cwd: path.join(__dirname, '..'),
  });
}

/**
 * @param {JSONSchema4} schema the schema to serialize
 * @param {string} schemaPath path to the JSON schema file to write
 */
async function writeSchema(schema, schemaPath) {
  await fs.mkdir(path.dirname(schemaPath), { recursive: true });
  await fs.writeFile(schemaPath, JSON.stringify(schema));
  await format(schemaPath);
}

/**
 * @param {string} version
 * @param {JSONSchema4} schema
 */
async function generateTS(version, schema) {
  const typingsPath = path.join(__dirname, '..', 'src', 'typings');
  const tsOutPath = path.join(typingsPath, 'cortexDebug.ts');
  console.log(`Generating typings to ${tsOutPath}`);
  await fs.mkdir(typingsPath, { recursive: true });
  const prettierConfig = require(path.join(
    __dirname,
    '..',
    '.prettierrc.json'
  ));
  const ts = await compile(schema, cortexDebugTitle, {
    format: true,
    style: prettierConfig,
    bannerComment: `/* eslint-disable */
    /**
    * Launch Configuration Attributes for \`cortex-debug@${version}\`. See the list of all available attributes [here](https://github.com/Marus/cortex-debug/blob/v${version}/debug_attributes.md).
    * 
    * This file was automatically generated. **DO NOT MODIFY IT BY HAND**.
    */
    `,
  });
  await fs.mkdir(path.dirname(tsOutPath), { recursive: true });
  await fs.writeFile(tsOutPath, ts);
}

/**
 * @param {string} sourcePath the location where the VSIX has been decompressed
 * @param {string} [type='cortex-debug'] the [type](https://code.visualstudio.com/api/references/contribution-points#contributes.debuggers) of the debugger. Defaults to `'cortex-debug'`.
 */
function getLaunchAttributes(sourcePath, type = 'cortex-debug') {
  console.log('Extracting the launch configuration attributes');
  const packageJsonPath = path.join(sourcePath, 'extension', 'package.json');
  const packageJson = require(packageJsonPath);
  const cortexDebug = packageJson.contributes.debuggers.find(
    (/** @type {{ type: string; }} */ contribution) =>
      contribution.type === type
  );
  const properties = cortexDebug.configurationAttributes.launch;
  return properties;
}

/**
 * @param {string} version
 * @param {string} targetDir
 * @returns {Promise<void>}
 */
async function downloadVSIX(version, targetDir) {
  const url = `https://downloads.arduino.cc/marus25.cortex-debug/marus25.cortex-debug-${version}.vsix`;
  const data = await download(url);
  await decompress(data, targetDir);
}

/**
 * Maps `"items": "TYPE"` to `"items": { "type": "TYPE" }`.
 * JSON-schema spec [mandates object type](https://json-schema.org/understanding-json-schema/reference/array#items) for array `items`,
 * while VS Code is more relaxed and allows string type.
 * @param {RelaxedJSONSchema4} schema
 * @returns {JSONSchema4}
 */
function fixSchema(schema) {
  /** @type {JSONSchema4} */
  const copy = JSON.parse(JSON.stringify(schema));
  /**
   *
   * @param {JSONSchema4|RelaxedJSONSchema4|undefined} s
   */
  const fixArrayItems = (s) => {
    if (s && s.properties) {
      Object.entries(s.properties).forEach(([, value]) => {
        if (value.items === 'string' && value.type === 'array') {
          value.items = { type: value.items };
        }
        fixArrayItems(value.properties);
      });
    }
  };
  fixArrayItems(copy);
  return copy;
}

/**
 * @param {string} version the semver of the cortex-debug extension to generate from.
 */
async function run(version) {
  // Set up working directory
  const tracked = temp.track();
  const tempDir = await tracked.mkdir();
  try {
    await generate(version, tempDir);
  } finally {
    tracked.cleanupSync();
  }
}

run(version);
