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
    /**
     * If `true` the LS will be restarted if it's running. Defaults to `false`.
     */
    readonly force?: boolean;
    readonly outputEnabled?: boolean;
}

let languageClient: LanguageClient | undefined;
let languageServerDisposable: vscode.Disposable | undefined;
let latestConfig: LanguageServerConfig | undefined;
let serverOutputChannel: vscode.OutputChannel | undefined;
let serverTraceChannel: vscode.OutputChannel | undefined;
let crashCount = 0;

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('arduino.languageserver.start', (config: LanguageServerConfig) => startLanguageServer(context, config))
    );
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
    if (config.outputEnabled) {
        if (!serverOutputChannel) {
            serverOutputChannel = vscode.window.createOutputChannel('Arduino Language Server');
        }
        if (!serverTraceChannel) {
            serverTraceChannel = vscode.window.createOutputChannel('Arduino Language Server (trace)');
        }
    }
    const { lsPath: command, clangdPath, cliPath, board, flags } = config;
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
            options: { env: config.env },
        },
        {
            initializationOptions: {},
            documentSelector: ['ino'],
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
