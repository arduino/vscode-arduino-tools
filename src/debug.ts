import {
  type DebugGCCToolchainConfiguration,
  type DebugOpenOCDServerConfiguration,
  type GetDebugConfigResponse as GrpcGetDebugConfigResponse,
} from 'ardunno-cli';
import { FQBN } from 'fqbn';
import getValue from 'get-value';
import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import setValue from 'set-value';
import unsetValue from 'unset-value';
import vscode from 'vscode';
import { isENOENT } from './errno';
import { ExecOptions, exec } from './exec';
import type { BoardIdentifier } from './typings';
import type { CortexDebugLaunchAttributes } from './typings/cortexDebug';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function activateDebug(_: vscode.ExtensionContext): vscode.Disposable {
  const toDispose = [
    vscode.commands.registerCommand(
      'arduino.debug.start',
      async (params: StartDebugParams) => {
        try {
          const launchConfig = await createLaunchConfig(params);
          return startDebug(params.launchConfigsDirPath, launchConfig);
        } catch (err) {
          if (err instanceof vscode.CancellationError) {
            return;
          }
          throw err;
        }
      }
    ),
    vscode.commands.registerCommand(
      'arduino.debug.createLaunchConfig',
      (params: StartDebugParams) => createLaunchConfig(params)
    ),
  ];
  return vscode.Disposable.from(...toDispose);
}

export interface StartDebugParams {
  /**
   * Absolute filesystem path to the Arduino CLI executable.
   */
  readonly cliPath: string;
  /**
   * The the board to debug.
   */
  readonly board: BoardIdentifier;
  /**
   * Absolute filesystem path of the sketch to debug.
   */
  readonly sketchPath: string;
  /**
   * Absolute filesystem path of the directory where the `launch.json` will be updated before starting every debug session.
   * If the launch config file is absent, it will be created.
   * If not defined, it falls back to `sketchPath/.vscode/launch.json` and uses VS Code APIs to alter the config.
   */
  readonly launchConfigsDirPath?: string;
  /**
   * Absolute path to the `arduino-cli.yaml` file. If not specified, it falls back to `~/.arduinoIDE/arduino-cli.yaml`.
   */
  readonly cliConfigPath?: string;
  /**
   * Programmer for the debugging.
   */
  readonly programmer?: string;
  /**
   * Custom progress title to use when getting the debug information from the CLI.
   */
  readonly title?: string;
}
export type StartDebugResult = boolean;

type CliGetDebugConfigResponse = Omit<
  GrpcGetDebugConfigResponse,
  'customConfigs'
> & {
  customConfigs: {
    [key: string]: CustomConfigValue;
  };
};

type DebugServerConfiguration =
  | DebugOpenOCDServerConfiguration
  | Record<string, unknown>;
type DebugToolchainConfiguration =
  | DebugGCCToolchainConfiguration
  | Record<string, unknown>;

/**
 * (non-API)
 */
export type DebugInfo = Partial<
  Omit<
    CliGetDebugConfigResponse,
    'toolchainConfiguration' | 'serverConfiguration'
  > & {
    serverConfiguration: DebugServerConfiguration | undefined;
    toolchainConfiguration: DebugToolchainConfiguration | undefined;
  }
>;
type ConfigIdentifier = { configId: string };
type Executable = Pick<CortexDebugLaunchAttributes, 'executable'>;
// List of supported attributes: https://github.com/Marus/cortex-debug/blob/v1.5.1/debug_attributes.md
export type CustomDebugConfig = Omit<
  RemoveIndex<CortexDebugLaunchAttributes>,
  keyof Executable
> &
  Partial<Executable> &
  ConfigIdentifier;
export type CustomDebugConfigs = CustomDebugConfig[];
export type ArduinoDebugLaunchConfig = CortexDebugLaunchAttributes &
  RemoveIndex<vscode.DebugConfiguration> &
  ConfigIdentifier;

function isCustomDebugConfig(arg: unknown): arg is CustomDebugConfig {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    (<CustomDebugConfig>arg).configId !== undefined &&
    typeof (<CustomDebugConfig>arg).configId === 'string'
  );
}

const cortexDebug = 'cortex-debug';

async function startDebug(
  launchConfigsDirPath: string | undefined,
  launchConfig: ArduinoDebugLaunchConfig
): Promise<StartDebugResult> {
  await updateLaunchConfigs(launchConfigsDirPath, launchConfig);
  return vscode.debug.startDebugging(undefined, launchConfig);
}

const getDebugInfoMessage = 'Getting debug info...';

async function createLaunchConfig(
  params: StartDebugParams
): Promise<ArduinoDebugLaunchConfig> {
  const { programmer, board } = params;
  const { file, args } = buildDebugInfoArgs(params);
  const [stdout, customConfigs] = await Promise.all([
    withProgress(
      () => cliExec(file, args),
      params.title ?? getDebugInfoMessage
    ),
    loadDebugCustomJson(params),
  ]);
  const debugInfo = await parseRawDebugInfo(stdout);
  if (!debugInfo) {
    throw new Error(
      `Could not parse config. Params: ${JSON.stringify(params)}`
    );
  }
  const launchConfig = await mergeLaunchConfig(
    board,
    programmer,
    debugInfo,
    customConfigs
  );
  return launchConfig;
}

async function withProgress<T>(
  task: () => Promise<T> | T,
  title: string
): Promise<T> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title },
    async (_, token) => {
      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      const result = await task();
      return result as T;
    }
  );
}

async function parseRawDebugInfo(
  raw: string | object
): Promise<(DebugInfo & Executable) | undefined> {
  const cliDebugConfig = typeof raw === 'object' ? raw : parseJson(raw);
  if (!cliDebugConfig) {
    return undefined;
  }
  const module = await import('camelcase-keys');
  const config = module.default(cliDebugConfig, {
    deep: true,
    stopPaths: ['custom_configs'],
  });
  if (!hasExecutable(config)) {
    throw new Error(
      `'executable' is missing from the debugger configuration. Configuration: ${JSON.stringify(
        config
      )}`
    );
  }
  return config;
}

function createConfigId(
  board: BoardIdentifier,
  programmer: string | undefined
): string {
  const fqbn = new FQBN(board.fqbn);
  if (!programmer) {
    return fqbn.toString();
  }
  if (hasConfigOptions(fqbn)) {
    // if already has config options, append the programmer as an ordinary custom board config option
    return `${fqbn.toString()},programmer=${programmer}`;
  } else {
    // create the new config options entry with the programmer as a single entry
    return `${fqbn.toString()}:programmer=${programmer}`;
  }
}

function hasConfigOptions(fqbn: FQBN): fqbn is Required<FQBN> {
  return !!fqbn.options && !!Object.keys(fqbn.boardId).length;
}

async function loadDebugCustomJson(
  params: Pick<StartDebugParams, 'sketchPath'>
): Promise<CustomDebugConfigs> {
  try {
    const raw = await fs.readFile(
      path.join(params.sketchPath, 'debug_custom.json'),
      { encoding: 'utf8' }
    );
    return parseCustomDebugConfigs(raw);
  } catch (err) {
    if (isENOENT(err)) {
      return [];
    }
    throw err;
  }
}

function parseCustomDebugConfigs(raw: string): CustomDebugConfigs {
  const configurations: CustomDebugConfig[] = [];
  const object = parseJson(raw);
  if (Array.isArray(object)) {
    configurations.push(...object.filter(isCustomDebugConfig));
  }
  return configurations;
}

function hasExecutable(config: DebugInfo): config is DebugInfo & Executable {
  return Boolean(config.executable);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(raw: string): any | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function buildDebugInfoArgs(
  params: Omit<StartDebugParams, 'launchConfigsDirPath'>
): Readonly<{
  file: string;
  args: readonly string[];
}> {
  const { cliPath, board, programmer, sketchPath, cliConfigPath } = params;
  return {
    file: cliPath,
    args: [
      'debug',
      '--info',
      '--fqbn',
      board.fqbn,
      ...(programmer ? ['--programmer', programmer] : []),
      sketchPath,
      ...(cliConfigPath ? ['--config-file', cliConfigPath] : []),
      '--format',
      'json',
    ],
  };
}

function resolveCliConfigPath(
  config: Pick<StartDebugParams, 'cliConfigPath'>
): string {
  return (
    config.cliConfigPath ??
    path.join(homedir(), '.arduinoIDE', 'arduino-cli.yaml') // IDE2 location
  );
}

async function mergeLaunchConfig(
  board: BoardIdentifier,
  programmer: string | undefined,
  debugInfo: DebugInfo & Executable,
  customConfigs: CustomDebugConfigs
): Promise<ArduinoDebugLaunchConfig> {
  const configId = createConfigId(board, programmer);
  const customConfig = customConfigs.find(
    (config) => config.configId === configId
  );
  const name = createName(board, programmer);
  const launchConfig = {
    configId,
    cwd: '${workspaceRoot}',
    request: 'launch',
    type: cortexDebug,
    ...debugInfo,
    ...(debugInfo.customConfigs
      ? debugInfo.customConfigs[cortexDebug] ?? {}
      : {}),
    ...(customConfig ? customConfig : {}),
    name,
  };
  replaceValue('serverPath', 'serverpath', launchConfig);
  replaceValue('server', 'servertype', launchConfig);
  replaceValue('toolchainPath', 'armToolchainPath', launchConfig);
  replaceValue('serverConfiguration.scripts', 'configFiles', launchConfig);
  unsetValue(launchConfig, 'customConfigs');
  unsetValue(launchConfig, 'serverConfiguration');
  unsetValue(launchConfig, 'programmer'); // The programmer is not used by the debugger https://github.com/arduino/arduino-cli/pull/2391
  unsetValue(launchConfig, 'toolchain'); // The toolchain is also unused by IDE2 or the cortex-debug VSIX
  return launchConfig;
}

function createName(
  board: BoardIdentifier,
  programmer: string | undefined
): string {
  if (!board.name) {
    const configId = createConfigId(board, programmer);
    return `Arduino (${configId})`;
  }
  const fqbn = new FQBN(board.fqbn);
  if (hasConfigOptions(fqbn)) {
    const options = Object.entries(fqbn.options)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    return `${board.name} (${options}${programmer ? `,${programmer}` : ''})`;
  }
  return `${board.name}${programmer ? ` (${programmer})` : ''}`;
}

function replaceValue(
  from: string,
  to: string,
  target: ArduinoDebugLaunchConfig
): ArduinoDebugLaunchConfig {
  const object: Record<string, unknown> = target;
  const value = getValue(object, from);
  if (value) {
    setValue(object, to, value);
    unsetValue(object, from);
  }
  return target;
}

// Iteration plan:
// 1. (done) update json configs object with a single config entry and write the file with fs (IDE 2.2.1 behavior)
// 2. (done) update json configs object by merging in the current config entry, and write file with fs
// 3. same as (2) but use jsonc to nicely update the JSON file
// 4. use the getConfiguration('launch') API to update the config. It must be verified whether it works in Theia
async function updateLaunchConfigs(
  launchConfigsDirPath: string | undefined,
  launchConfig: ArduinoDebugLaunchConfig
): Promise<void> {
  const launchConfigs = await (launchConfigsDirPath
    ? loadLaunchConfigsFile(launchConfigsDirPath)
    : vscode.workspace.getConfiguration().get<LaunchConfigs>('launch') ??
      createEmptyLaunchConfigs());

  const index = launchConfigs.configurations.findIndex(
    (c) => c['configId'] === launchConfig.configId
  );
  if (index < 0) {
    launchConfigs.configurations.push(launchConfig);
  } else {
    launchConfigs.configurations.splice(index, 1, launchConfig);
  }

  if (launchConfigsDirPath) {
    await fs.mkdir(launchConfigsDirPath, { recursive: true });
    await fs.writeFile(
      path.join(launchConfigsDirPath, 'launch.json'),
      JSON.stringify(launchConfigs, null, 2)
    );
  } else {
    const configuration = vscode.workspace.getConfiguration();
    await configuration.update('launch', launchConfigs, false);
  }
}
type LaunchConfigs = {
  version: '0.2.0';
  configurations: vscode.DebugConfiguration[];
};
function createEmptyLaunchConfigs(): LaunchConfigs {
  return {
    version: '0.2.0',
    configurations: [],
  };
}
function isLaunchConfigs(arg: unknown): arg is LaunchConfigs {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    (<LaunchConfigs>arg).version === '0.2.0' &&
    Array.isArray((<LaunchConfigs>arg).configurations)
  );
}

async function loadLaunchConfigsFile(
  launchConfigsDirPath: string
): Promise<LaunchConfigs> {
  try {
    const raw = await fs.readFile(
      path.join(launchConfigsDirPath, 'launch.json'),
      { encoding: 'utf8' }
    );
    const maybeConfigs = parseJson(raw);
    if (isLaunchConfigs(maybeConfigs)) {
      return maybeConfigs;
    }
    return createEmptyLaunchConfigs();
  } catch (err) {
    if (isENOENT(err)) {
      return createEmptyLaunchConfigs();
    }
    throw err;
  }
}

async function cliExec<T = Record<string, unknown>>(
  cliPath: string,
  args: readonly string[],
  cliConfigPath?: string,
  options?: ExecOptions
): Promise<T> {
  try {
    const stdout = await exec(
      cliPath,
      [
        ...args,
        ...(cliConfigPath ? ['--config-file', cliConfigPath] : []),
        '--format',
        'json',
      ],
      options
    );
    // `arduino-cli sketch new` does not provide valid JSON on the stdout
    // TODO: open a GH issue if it's a bug
    return stdout ? JSON.parse(stdout) : {};
  } catch (err) {
    let cliError: Error | undefined = undefined;
    if (isExecaError(err)) {
      try {
        const object = JSON.parse(err.stderr);
        if (isCommandError(object)) {
          cliError = new CliError(object.error, err.exitCode);
        }
      } catch {}
    }
    throw cliError ?? err;
  }
}

function isExecaError(
  arg: unknown
): arg is Error & { stderr: string; exitCode: number | undefined } {
  return (
    arg instanceof Error &&
    'stderr' in arg &&
    typeof arg.stderr === 'string' &&
    'exitCode' in arg &&
    (typeof arg.exitCode === 'number' || typeof arg.exitCode === 'undefined')
  );
}

interface CommandError {
  readonly error: string;
}
function isCommandError(arg: unknown): arg is CommandError {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    (<CommandError>arg).error !== undefined &&
    typeof (<CommandError>arg).error == 'string'
  );
}

export class CliError extends Error {
  constructor(message: string, readonly exitCode: number | undefined) {
    super(message);
    this.name = CliError.name;
  }
}

// https://github.com/arduino/arduino-cli/blob/b41f4044cac6ab7f7d853e368bc31e5d626d63d4/internal/cli/feedback/errorcodes.go#L43-L44
const badArgumentCode = 7 as const;
function isBadArgumentError(
  arg: unknown
): arg is CliError & { exitCode: typeof badArgumentCode } {
  return arg instanceof CliError && arg.exitCode === badArgumentCode;
}

// Remove index signature
// https://stackoverflow.com/a/51956054/5529090
type RemoveIndex<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
    ? never
    : symbol extends K
    ? never
    : K]: T[K];
};

// Recursive type for custom debug configuration
type CustomConfigValue = {
  [name: string]: string | number | boolean | CustomConfigValue;
};

/**
 * (non-API)
 */
export const __tests__ = {
  CliError,
  createName,
  createConfigId,
  buildDebugInfoArgs,
  parseRawDebugInfo,
  resolveCliConfigPath,
  loadDebugCustomJson,
  parseCustomDebugConfigs,
  isCustomDebugConfig,
  createLaunchConfig,
  mergeLaunchConfig,
  updateLaunchConfigs,
  isCommandError,
  isBadArgumentError,
  cliExec,
} as const;
