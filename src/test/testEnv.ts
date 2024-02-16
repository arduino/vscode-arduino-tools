import fs from 'node:fs/promises';
import path from 'node:path';
import type temp from 'temp';
import { __tests__ } from '../debug';
import { isENOENT } from '../errno';
import { exec } from '../exec';

export interface TestEnv {
  readonly cliPath: string;
  readonly userDirPath: string;
  readonly dataDirPath: string;
  readonly tracked: typeof temp;
  /**
   * The keys are locales values are the absolute filesystem path of the CLI configuration with the pre-configured `locale`.
   */
  readonly cliConfigPaths: Readonly<{
    en: string;
    [local: string]: string;
  }>;

  /**
   * Sugar for `cliConfigPaths['en']`
   */
  get cliConfigPath(): string;
}

export interface PrepareTestEnvParams extends Omit<TestEnv, 'cliConfigPath'> {
  readonly platformsToInstall?: readonly {
    platform: string;
    version?: string;
  }[];
  readonly additionalUrls?: readonly string[];
}

export async function prepareTestEnv(
  params: PrepareTestEnvParams
): Promise<void> {
  log(`Preparing test envs: ${JSON.stringify(params)}`);
  await prepareWithCli(params);
  await prepareWithGit(params);
  log('Done');
}

// The latest samd core changes are not yet released
// https://github.com/arduino/ArduinoCore-samd#developing
async function prepareWithGit(params: PrepareTestEnvParams): Promise<void> {
  log('Preparing test env with Git.');
  const arduinoGitPath = path.join(params.userDirPath, 'hardware/arduino-git');
  try {
    const stat = await fs.stat(arduinoGitPath);
    if (stat.isDirectory()) {
      log(`Skipping. ${arduinoGitPath} already exists`);
      return;
    }
    throw new Error(`${arduinoGitPath} is not a directory.`);
  } catch (err) {
    if (isENOENT(err)) {
      // continue
    } else {
      throw err;
    }
  }
  // This is where https://github.com/arduino/ArduinoCore-API.git will be cloned
  const arduinoCoreApiPath = await params.tracked.mkdir();
  await exec(
    'git',
    ['clone', 'https://github.com/arduino/ArduinoCore-API.git', '--depth', '1'],
    {
      cwd: arduinoCoreApiPath,
    }
  );

  // This is where the patched samd core will be cloned
  await fs.mkdir(arduinoGitPath, { recursive: true });
  await exec(
    'git',
    [
      'clone',
      'https://github.com/umbynos/ArduinoCore-samd.git', // use a fork for the PR https://github.com/arduino/ArduinoCore-samd/pull/710
      '--depth',
      '1',
      '--branch',
      'debug-enhancements', // branch from https://github.com/arduino/ArduinoCore-samd/pull/710
      'samd',
    ],
    {
      cwd: arduinoGitPath,
    }
  );
  await fs.cp(
    path.join(arduinoCoreApiPath, 'ArduinoCore-API/api'),
    path.join(arduinoGitPath, 'samd/cores/arduino/api'),
    { recursive: true }
  );
  log('Done');
}

async function prepareWithCli(params: PrepareTestEnvParams): Promise<void> {
  log('Preparing test env with CLI');
  const cliExec = (args: string[], cliConfigPath?: string) =>
    __tests__.cliExec(params.cliPath, args, cliConfigPath);
  const { cliConfigPaths, dataDirPath, userDirPath, additionalUrls } = params;
  for (const [locale, cliConfigPath] of Object.entries(cliConfigPaths)) {
    await fs.mkdir(path.dirname(cliConfigPath), { recursive: true });
    await Promise.all([
      await cliExec([
        'config',
        'init',
        '--dest-file',
        cliConfigPath,
        '--overwrite',
      ]),
      await fs.mkdir(dataDirPath, { recursive: true }),
      await fs.mkdir(userDirPath, { recursive: true }),
    ]);
    await cliExec(
      ['config', 'set', 'directories.user', userDirPath],
      cliConfigPath
    );
    await cliExec(
      ['config', 'set', 'directories.data', dataDirPath],
      cliConfigPath
    );
    if (additionalUrls) {
      await cliExec(
        ['config', 'set', 'board_manager.additional_urls', ...additionalUrls],
        cliConfigPath
      );
    }
    await cliExec(['config', 'set', 'locale', locale], cliConfigPath);
    const config = await cliExec(['config', 'dump'], cliConfigPath);
    log(`Using CLI config (locale: ${locale}): ${JSON.stringify(config)}`);
  }
  const cliConfigPath = cliConfigPaths['en'];
  await cliExec(['core', 'update-index'], cliConfigPath);
  log('Updated index');
  for (const { platform, version } of params.platformsToInstall ?? []) {
    const toInstall = version ? `${platform}@${version}` : platform;
    log(`Installing ${toInstall}...`);
    const args = ['core', 'install', toInstall, '--skip-post-install'];
    await cliExec(args, cliConfigPath);
    log(`Done. Installed ${toInstall}`);
  }
  log('Done');
}

const log = (...args: Parameters<typeof console.log>) => console.log(...args);
