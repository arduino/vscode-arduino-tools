import { posix } from 'path';
import { spawnSync } from 'child_process';
import deepEqual from 'deep-equal';
import WebRequest from 'web-request';
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
let serverOutputChannel: vscode.OutputChannel | undefined;
let serverTraceChannel: vscode.OutputChannel | undefined;
let crashCount = 0;

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('arduino.languageserver.start', (config: LanguageServerConfig) => startLanguageServer(context, config)),
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
                vscode.window.showErrorMessage(`Sketch '${posix.basename(config.sketchPath)}' was not compiled. Please compile the sketch and start debugging again.`);
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
    const debugConfig = {
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
    // Create the `launch.json` if it does not exist. Otherwise, update the existing.
    const configuration = vscode.workspace.getConfiguration();
    const launchConfig = {
        version: '0.2.0',
        'configurations': [
            {
                ...debugConfig
            }
        ]
    };
    await configuration.update('launch', launchConfig, false);
    return vscode.debug.startDebugging(undefined, debugConfig);
}

async function startLanguageServer(context: ExtensionContext, config: LanguageServerConfig): Promise<void> {
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
        languageClient = buildLanguageClient(config);
        crashCount = 0;
    }

    languageServerDisposable = languageClient.start();
    context.subscriptions.push(languageServerDisposable);
}

function buildLanguageClient(config: LanguageServerConfig): LanguageClient {
    if (!serverOutputChannel) {
        serverOutputChannel = vscode.window.createOutputChannel('Arduino Language Server');
    }
    if (!serverTraceChannel) {
        serverTraceChannel = vscode.window.createOutputChannel('Arduino Language Server (trace)');
    }
    const { lsPath: command, clangdPath, cliPath, board, flags, env } = config;
    const args = ['-clangd', clangdPath, '-cli', cliPath, '-fqbn', board.fqbn];
    if (board.name) {
        args.push('-board-name', board.name);
    }
    if (flags && flags.length) {
        args.push(...flags);
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
            documentSelector: ['ino', 'c', 'cpp', 'h', 'hpp'],
            uriConverters: {
                code2Protocol: (uri: vscode.Uri): string => (uri.scheme ? uri : uri.with({ scheme: 'file' })).toString(),
                protocol2Code: (uri: string) => vscode.Uri.parse(uri)
            },
            outputChannel: serverOutputChannel,
            traceOutputChannel: serverTraceChannel,
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
