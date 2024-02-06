import { glob } from 'glob';
import Mocha from 'mocha';
import os from 'node:os';
import path from 'node:path';
import temp from 'temp';
import { PrepareTestEnvParams, TestEnv, prepareTestEnv } from '../testEnv';

export async function run(): Promise<void> {
  let timeout: number | undefined = 60_000;
  let testsPattern = '**/**.test.js';
  const context = testContext();
  if (context === 'all') {
    testsPattern = '**/*test.js';
  } else if (context === 'slow') {
    testsPattern = '**/**.slow-test.js';
  } else {
    timeout = undefined;
  }
  if (noTestTimeout()) {
    timeout = 0;
  }
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout,
  });
  const tracked = temp.track();
  mocha.suite.ctx['tracked'] = tracked;
  if (context) {
    const testEnv = await setup(tracked);
    mocha.suite.ctx['testEnv'] = testEnv;
  }
  const testsRoot = path.resolve(__dirname);
  const files = await glob(testsPattern, { cwd: testsRoot });
  files.forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));
  try {
    await new Promise<void>((resolve, reject) => {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    });
  } finally {
    tracked.cleanupSync();
  }
}

function testContext(): 'slow' | 'all' | undefined {
  if (typeof process.env.TEST_CONTEXT === 'string') {
    const value = process.env.TEST_CONTEXT;
    if (/all/i.test(value)) {
      return 'all';
    }
    if (/slow/i.test(value)) {
      return 'slow';
    }
  }
  return undefined;
}

function noTestTimeout(): boolean {
  return (
    typeof process.env.NO_TEST_TIMEOUT === 'string' &&
    /true/i.test(process.env.NO_TEST_TIMEOUT)
  );
}

const testsPath = path.join(__dirname, '..', '..', '..', '.tests');
const dataDirPath = path.join(testsPath, 'data');
const userDirPath = path.join(testsPath, 'user');
const cliFilename = `arduino-cli${os.platform() === 'win32' ? '.exe' : ''}`;
const cliPath = path.join(testsPath, cliFilename);

async function setup(tracked: typeof temp): Promise<TestEnv> {
  const cliConfigPaths = {
    en: path.join(testsPath, 'arduino-cli.yaml'),
    it: path.join(testsPath, 'arduino-cli-it.yaml'),
  } as const;
  const testEnv: TestEnv = {
    cliConfigPaths,
    cliPath,
    dataDirPath,
    userDirPath,
    tracked,
    get cliConfigPath() {
      return cliConfigPaths['en'];
    },
  };
  const params: PrepareTestEnvParams = {
    ...testEnv,
    platformsToInstall: [
      { platform: 'arduino:avr' }, // this is an arbitrary core without default programmer set to get the expected error from the CLI with the --programmer value is missing
      { platform: 'arduino:esp32', version: '3.0.0-arduino3r2' },
      { platform: 'arduino:samd' }, // samd is need to get the tools for the manually (Git) installed core
    ],
    additionalUrls: [
      'https://downloads.arduino.cc/packages/package_nano_esp32_index.json',
    ],
  };
  await prepareTestEnv(params);
  return testEnv;
}
