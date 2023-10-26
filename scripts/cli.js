// @ts-check

// Downloads the Arduino CLI from arduino.cc to `.downloads/` and makes it available for the tests.
// It's a NOOP if the the CLI is already downloaded.
// Usage: `node ./scripts/cli.js 0.35.0-rc.1`

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const temp = require('temp');
const { download, decompress } = require('./utils');

const [version] = process.argv.slice(2);
if (!version) {
  console.error('The Arduino CLI version argument must be specified.');
  process.exit(1);
}

const cliFilename = `arduino-cli${os.platform() === 'win32' ? '.exe' : ''}`;
const cliPath = path.join(__dirname, '..', '.tests', cliFilename);

/**
 * @param {string} file absolute filesystem path to the Arduino CLI
 */
async function checkCliAccessible(file) {
  try {
    const stdout = await exec(file, ['version', '--format', 'json']);
    return typeof JSON.parse(stdout) === 'object';
  } catch {
    return false;
  }
}

/**
 * @param {string} file
 * @param {readonly string[] | undefined} [args=undefined]
 */
async function exec(file, args) {
  const { execa } = await import('execa');
  const { stdout } = await execa(file, args);
  return stdout;
}

const platforms = {
  linux: 'Linux',
  darwin: 'macOS',
  win32: 'Windows',
};
const arches = {
  x64: '64bit',
  arm64: 'ARM64',
};
const extensions = {
  linux: 'tar.gz',
  darwin: 'tar.gz',
  win32: 'zip',
};

/**
 * @param {string} version
 */
function downloadUrl(version) {
  const platform = os.platform();
  const arch = os.arch();
  const cliPlatform = platforms[platform];
  const cliArch = arches[arch];
  const cliExtension = extensions[platform];
  if (!cliPlatform || !cliArch || !cliExtension) {
    throw new Error(
      `Arduino CLI is unavailable on '${platform}' [arch: ${arch}].`
    );
  }
  const suffix = `${cliPlatform}_${cliArch}.${cliExtension}`;
  return `https://downloads.arduino.cc/arduino-cli/arduino-cli_${version}_${suffix}`;
}

/**
 * @param {string} version
 */
async function run(version) {
  if (await checkCliAccessible(cliPath)) {
    return;
  }

  const url = downloadUrl(version);
  const data = await download(url);

  const tracked = temp.track();
  try {
    const tempDir = await tracked.mkdir();
    await decompress(data, tempDir);
    await fs.cp(path.join(tempDir, cliFilename), cliPath, { force: false });
  } finally {
    tracked.cleanupSync();
  }
}

run(version);
