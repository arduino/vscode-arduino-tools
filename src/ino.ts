import { Mutex } from 'async-mutex';
import deepEqual from 'deep-equal';
import { promises as fs } from 'node:fs';
import vscode from 'vscode';
import {
  CloseAction,
  DocumentUri,
  ErrorAction,
  LanguageClient,
  LanguageClientOptions,
  Message,
  NotificationType,
  RevealOutputChannelOn,
} from 'vscode-languageclient';
import type { BoardIdentifier, DaemonAddress } from './typings';

export interface StartLanguageServerParams {
  /**
   * Absolute filesystem path to the Arduino Language Server executable.
   */
  readonly lsPath: string;
  /**
   * The hostname and the port for the gRPC channel connecting to the Arduino CLI daemon.
   * The `instance` number is for the initialized core Arduino client.
   */
  readonly daemonAddress: DaemonAddress;
  /**
   * Absolute filesystem path to [`clangd`](https://clangd.llvm.org/).
   */
  readonly clangdPath: string;
  /**
   * The board is relevant to start a specific "flavor" of the language.
   */
  readonly board: BoardIdentifier;
  /**
   * `true` if the LS should generate the log files into the default location. The default location is the `cwd` of the process.
   * It's very often the same as the workspace root of the IDE, aka the sketch folder.
   * When it is a string, it is the absolute filesystem path to the folder to generate the log files.
   * If `string`, but the path is inaccessible, the log files will be generated into the default location.
   */
  readonly log?: boolean | string;
  /**
   * Optional `env` for the language server process.
   */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Additional flags for the Arduino Language server process.
   */
  readonly flags?: readonly string[];
  /**
   * Set to `true`, to enable `Diagnostics`.
   */
  readonly realTimeDiagnostics?: boolean;
  /**
   * If `true`, the logging is not forwarded to the _Output_ view via the language client.
   */
  readonly silentOutput?: boolean;
}

/**
 * The FQBN the language server runs with or `undefined` if it could not start.
 */
export type StartLanguageServerResult = string | undefined;

export interface DidCompleteBuildParams {
  readonly buildOutputUri: DocumentUri;
}
export namespace DidCompleteBuildNotification {
  export const TYPE = new NotificationType<DidCompleteBuildParams, void>(
    'ino/didCompleteBuild'
  );
}

let languageClient: LanguageClient | undefined;
let languageServerDisposable: vscode.Disposable | undefined;
let latestParams: StartLanguageServerParams | undefined;
let crashCount = 0;
const languageServerStartMutex = new Mutex();
// TODO: use later for `start`, `stop`, and `restart` language server. (https://code.visualstudio.com/api/references/when-clause-contexts)
let languageServerIsRunning = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function activateIno(_: vscode.ExtensionContext): vscode.Disposable {
  const toDispose = [
    vscode.commands.registerCommand(
      'arduino.languageserver.start',
      async (config: StartLanguageServerParams) => {
        const unlock = await languageServerStartMutex.acquire();
        try {
          const started = await startLanguageServer(config);
          languageServerIsRunning = started;
          return languageServerIsRunning ? config.board.fqbn : undefined;
        } catch (err) {
          console.error('Failed to start the language server.', err);
          languageServerIsRunning = false;
          throw err;
        } finally {
          unlock();
        }
      }
    ),
    vscode.commands.registerCommand('arduino.languageserver.stop', async () => {
      const unlock = await languageServerStartMutex.acquire();
      try {
        await stopLanguageServer();
        languageServerIsRunning = false;
      } finally {
        unlock();
      }
    }),
    vscode.commands.registerCommand(
      'arduino.languageserver.restart',
      async () => {
        if (!latestParams) {
          return undefined;
        }
        return vscode.commands.executeCommand(
          'arduino.languageserver.start',
          latestParams
        );
      }
    ),
    vscode.commands.registerCommand(
      'arduino.languageserver.notifyBuildDidComplete',
      (params: DidCompleteBuildParams) => {
        if (languageClient) {
          languageClient.sendNotification(
            DidCompleteBuildNotification.TYPE,
            params
          );
        } else {
          vscode.window.showWarningMessage('Language server is not running.');
        }
      }
    ),
    new vscode.Disposable(() => languageServerDisposable?.dispose()),
  ];
  return vscode.Disposable.from(...toDispose);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function stopLanguageServer(): Promise<void> {
  if (languageClient) {
    if (languageClient.diagnostics) {
      languageClient.diagnostics.clear();
    }
    await languageClient.stop();
    if (languageServerDisposable) {
      languageServerDisposable.dispose();
    }
  }
}

async function startLanguageServer(
  config: StartLanguageServerParams
): Promise<boolean> {
  await stopLanguageServer();
  if (!languageClient || !deepEqual(latestParams, config)) {
    latestParams = config;
    languageClient = await buildLanguageClient(config);
    crashCount = 0;
  }

  languageServerDisposable = languageClient.start();
  await languageClient.onReady();
  return true;
}

async function buildLanguageClient(
  config: StartLanguageServerParams
): Promise<LanguageClient> {
  const {
    lsPath: command,
    clangdPath,
    daemonAddress,
    board,
    flags,
    env,
    log,
  } = config;
  const args = [
    '-clangd',
    clangdPath,
    '-cli-daemon-addr',
    `${daemonAddress.hostname}:${daemonAddress.port}`,
    '-cli-daemon-instance',
    String(daemonAddress.instance),
    '-fqbn',
    board.fqbn,
    '-skip-libraries-discovery-on-rebuild', // The default Arduino IDE behavior
  ];
  if (board.name) {
    args.push('-board-name', board.name);
  }
  if (
    typeof config.realTimeDiagnostics === 'boolean' &&
    !config.realTimeDiagnostics
  ) {
    args.push('-no-real-time-diagnostics');
  }
  if (flags && flags.length) {
    args.push(...flags);
  }
  if (log) {
    args.push('-log');
    let logPath: string | undefined = undefined;
    if (typeof log === 'string') {
      try {
        const stats = await fs.stat(log);
        if (stats.isDirectory()) {
          logPath = log;
        }
      } catch {}
    }
    if (logPath) {
      args.push('-logpath', logPath);
    }
  }
  const clientOptions: LanguageClientOptions = {
    initializationOptions: {},
    documentSelector: ['ino', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'pde'],
    uriConverters: {
      code2Protocol: (uri: vscode.Uri): string =>
        (uri.scheme ? uri : uri.with({ scheme: 'file' })).toString(),
      protocol2Code: (uri: string) => vscode.Uri.parse(uri),
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    initializationFailedHandler: (error): boolean => {
      vscode.window.showErrorMessage(
        `The language server is not able to serve any features. Initialization failed: ${error}.`
      );
      return false;
    },
    errorHandler: {
      error: (error: Error, message: Message, count: number): ErrorAction => {
        vscode.window.showErrorMessage(
          `Error communicating with the language server: ${error}: ${message}.`
        );
        if (count < 5) {
          return ErrorAction.Continue;
        }
        return ErrorAction.Shutdown;
      },
      closed: (): CloseAction => {
        crashCount++;
        if (crashCount < 5) {
          return CloseAction.Restart;
        }
        return CloseAction.DoNotRestart;
      },
    },
  };
  if (!!config.silentOutput) {
    clientOptions.outputChannel = noopOutputChannel('Arduino Language Server');
  }
  const serverOptions = {
    command,
    args,
    options: { env },
  };
  return new LanguageClient(
    'ino',
    'Arduino Language Server',
    serverOptions,
    clientOptions
  );
}

const noopChannel: Omit<vscode.OutputChannel, 'name'> = {
  append: () => {
    // NOOP
  },
  appendLine: () => {
    // NOOP
  },
  clear: () => {
    // NOOP
  },
  dispose: () => {
    // NOOP
  },
  hide: () => {
    // NOOP
  },
  show: () => {
    // NOOP
  },
  replace: () => {
    // NOOP
  },
};

function noopOutputChannel(name: string): vscode.OutputChannel {
  return {
    ...noopChannel,
    name,
  };
}
