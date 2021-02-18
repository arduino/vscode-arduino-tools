import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { spawnSync } from 'child_process';
import deepEqual from 'deep-equal';
import WebRequest from 'web-request';
import deepmerge from 'deepmerge';
import { Mutex } from 'async-mutex';
import vscode, { ExtensionContext } from 'vscode';
import { LanguageClient, CloseAction, ErrorAction, InitializeError, Message, RevealOutputChannelOn } from 'vscode-languageclient';

interface LanguageServerConfig {
    readonly lsPath: string;
    readonly cliPath: string;
    readonly clangdPath: string;
    readonly board: {
        readonly fqbn: string;
        readonly name?: string;
    }
    /**
     * `true` if the LS should generate log files into the default location. The default location is `cwd` of the process. It's very often the same
     * as the workspace root of the IDE, aka the sketch folder.
     * When it is a string, it is the folder where the log files should be generated. If the path is invalid (does not exist, not a folder),
     * the log files will be generated into the default location.
     */
    readonly log?: boolean | string;
    readonly env?: any;
    readonly flags?: string[];
}

interface DebugConfig {
    readonly cliPath: string;
    readonly board: {
        readonly fqbn: string;
        readonly name?: string;
    }
    readonly sketchPath: string;
}

interface DebugInfo {
    readonly executable: string;
    readonly toolchain: string;
    readonly toolchain_path: string;
    readonly toolchain_prefix: string;
    readonly server: string;
    readonly server_path: string;
    readonly server_configuration: {
        readonly path: string;
        readonly script: string;
        readonly scripts_dir: string;
    }
}

let languageClient: LanguageClient | undefined;
let languageServerDisposable: vscode.Disposable | undefined;
let latestConfig: LanguageServerConfig | undefined;
let crashCount = 0;
const languageServerStartMutex = new Mutex();
export let languageServerIsRunning = false; // TODO: use later for `start`, `stop`, and `restart` language server.

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('arduino.languageserver.start', async (config: LanguageServerConfig) => {
            const unlock = await languageServerStartMutex.acquire();
            try {
                const started = await startLanguageServer(context, config);
                languageServerIsRunning = started;
                return languageServerIsRunning ? config.board.fqbn : undefined;
            } finally {
                unlock();
            }
        }),
        vscode.commands.registerCommand('arduino.debug.start', (config: DebugConfig) => startDebug(context, config))
    );
}

async function startDebug(_: ExtensionContext, config: DebugConfig): Promise<boolean> {
    let info: DebugInfo | undefined = undefined;
    let rawStdout: string | undefined = undefined;
    let rawStdErr: string | undefined = undefined;
    try {
        const args = ['debug', '-I', '-b', config.board.fqbn, config.sketchPath, '--format', 'json'];
        const { stdout, stderr } = spawnSync(config.cliPath, args, { encoding: 'utf8' });
        rawStdout = stdout.trim();
        rawStdErr = stderr.trim();
    } catch (err) {
        const message = err instanceof Error ? err.stack || err.message : 'Unknown error';
        vscode.window.showErrorMessage(message);
        return false;
    }
    if (!rawStdout) {
        if (rawStdErr) {
            if (rawStdErr.indexOf('compiled sketch not found in') !== -1) {
                vscode.window.showErrorMessage(`Sketch '${path.basename(config.sketchPath)}' was not compiled. Please compile the sketch and start debugging again.`);
            } else {
                vscode.window.showErrorMessage(rawStdErr);
            }
        }
        return false;
    }
    try {
        info = JSON.parse(rawStdout);
    } catch (err) {
        vscode.window.showErrorMessage(err);
    }
    if (!info) {
        return false;
    }
    const defaultDebugConfig = {
        cwd: '${workspaceRoot}',
        name: 'Arduino',
        request: 'launch',
        type: 'cortex-debug',
        executable: info.executable,
        servertype: info.server,
        serverpath: info.server_path,
        armToolchainPath: info.toolchain_path,
        configFiles: [
            info.server_configuration.script
        ]
    };

    let customDebugConfig = {};
    try {
        const raw = await promisify(fs.readFile)(path.join(config.sketchPath, 'debug_custom.json'), { encoding: 'utf8' });
        customDebugConfig = JSON.parse(raw);
    } catch { }
    const mergedDebugConfig = deepmerge(defaultDebugConfig, customDebugConfig);

    // Create the `launch.json` if it does not exist. Otherwise, update the existing.
    const configuration = vscode.workspace.getConfiguration();
    const launchConfig = {
        version: '0.2.0',
        'configurations': [
            {
                ...mergedDebugConfig
            }
        ]
    };
    await configuration.update('launch', launchConfig, false);
    return vscode.debug.startDebugging(undefined, mergedDebugConfig);
}

async function startLanguageServer(context: ExtensionContext, config: LanguageServerConfig): Promise<boolean> {
    if (languageClient) {
        if (languageClient.diagnostics) {
            languageClient.diagnostics.clear();
        }
        await languageClient.stop();
        if (languageServerDisposable) {
            languageServerDisposable.dispose();
        }
    }
    if (!languageClient || !deepEqual(latestConfig, config)) {
        latestConfig = config;
        languageClient = await buildLanguageClient(config);
        crashCount = 0;
    }

    languageServerDisposable = languageClient.start();
    context.subscriptions.push(languageServerDisposable);
    await languageClient.onReady();
    return true;
}

async function buildLanguageClient(config: LanguageServerConfig): Promise<LanguageClient> {
    const { lsPath: command, clangdPath, cliPath, board, flags, env, log } = config;
    const args = ['-clangd', clangdPath, '-cli', cliPath, '-fqbn', board.fqbn];
    if (board.name) {
        args.push('-board-name', board.name);
    }
    if (flags && flags.length) {
        args.push(...flags);
    }
    if (!!log) {
        args.push('-log');
        let logPath: string | undefined = undefined;
        if (typeof log === 'string') {
            try {
                const stats = await promisify(fs.stat)(log);
                if (stats.isDirectory()) {
                    logPath = log;
                }
            } catch { }
        }
        if (logPath) {
            args.push('-logpath', logPath);
        }
    }
    return new LanguageClient(
        'ino',
        'Arduino Language Server',
        {
            command,
            args,
            options: { env },
        },
        {
            initializationOptions: {},
            documentSelector: ['ino', 'c', 'cpp', 'h', 'hpp', 'pde'],
            uriConverters: {
                code2Protocol: (uri: vscode.Uri): string => (uri.scheme ? uri : uri.with({ scheme: 'file' })).toString(),
                protocol2Code: (uri: string) => vscode.Uri.parse(uri)
            },
            revealOutputChannelOn: RevealOutputChannelOn.Never,
            initializationFailedHandler: (error: WebRequest.ResponseError<InitializeError>): boolean => {
                vscode.window.showErrorMessage(`The language server is not able to serve any features. Initialization failed: ${error}.`);
                return false;
            },
            errorHandler: {
                error: (error: Error, message: Message, count: number): ErrorAction => {
                    vscode.window.showErrorMessage(`Error communicating with the language server: ${error}: ${message}.`);
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
                }
            }
        }
    );
}
