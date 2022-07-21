import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promises as fs, constants } from 'fs';
import { spawnSync } from 'child_process';
import deepEqual from 'deep-equal';
import WebRequest from 'web-request';
import deepmerge from 'deepmerge';
import { Mutex, MutexInterface } from 'async-mutex';
import vscode, { ExtensionContext, TextDocument, Uri, WorkspaceFolder } from 'vscode';
import { LanguageClient, CloseAction, ErrorAction, InitializeError, Message, RevealOutputChannelOn } from 'vscode-languageclient';
import { globbySync } from 'globby';
import { DidCompleteBuildNotification } from './protocol';

const sketchContexts: Map<string, SketchContext> = new Map();
function getOrCreateContext(sketch: string): SketchContext | undefined {
    const sketches = sortedSketches();
    if (!sketches.includes(sketch)) {
        return undefined;
    }
    let context = sketchContexts.get(sketch);
    if (!context) {
        context = {
            crashCount: 0,
            mutex: new Mutex()
        };
        sketchContexts.set(sketch, context);
    }
    return context;
}
let _sortedSketches: string[] | undefined;
function sortedSketches(): string[] {
    if (_sortedSketches === undefined) {
        _sortedSketches = vscode.workspace.workspaceFolders ? Array.from(vscode.workspace.workspaceFolders.map(discoverSketchesInFolder).reduce((acc, sketchPathsPerFolder) => {
            sketchPathsPerFolder.forEach(sketchPath => acc.add(sketchPath));
            return acc;
        }, new Set<string>())) : [];
        _sortedSketches.sort((left, right) => left.length - right.length);
        signalDiscoveredSketches(!!_sortedSketches.length);
    }
    return _sortedSketches;
}

function discoverSketchesInFolder(folder: WorkspaceFolder): string[] {
    const sketchPaths: string[] = [];
    if (folder.uri.scheme === 'file') {
        const folderPath = folder.uri.fsPath;
        const candidateSketchFilePaths = globbySync(['**/*.{ino,pde}', '!hardware/**', '!libraries/**'], { cwd: folderPath, absolute: true });
        // filter out nested sketches
        candidateSketchFilePaths.sort((left, right) => left.length - right.length);
        console.log('workspace folder URI: ' + folder.uri.toString(), JSON.stringify(candidateSketchFilePaths));
        for (const sketchFilePath of candidateSketchFilePaths) {
            const relative = path.relative(folderPath, sketchFilePath);
            if (!relative) {
                continue;
            }
            const segments = relative.split(path.sep);
            if (segments.length < 2) {
                if (path.dirname(sketchFilePath) === folderPath && (path.basename(folderPath) + '.ino' === path.basename(sketchFilePath) || path.basename(folderPath) + '.pde' === path.basename(sketchFilePath))) {
                    const sketchPath = path.join(sketchFilePath, '..');
                    if (!sketchPaths.includes(sketchPath) && sketchPaths.every(otherSketchPath => !sketchFilePath.startsWith(otherSketchPath))) {
                        sketchPaths.push(sketchPath);
                    }
                };
                continue;
            }
            const sketchName = segments[segments.length - 2];
            const sketchFileExtension = segments[segments.length - 1].replace(
                new RegExp(sketchName),
                ''
            );
            if (sketchFileExtension !== '.ino' && sketchFileExtension !== '.pde') {
                continue;
            }
            const sketchPath = path.join(sketchFilePath, '..');
            if (!sketchPaths.includes(sketchPath) && sketchPaths.every(otherSketchPath => !sketchFilePath.startsWith(otherSketchPath))) {
                sketchPaths.push(sketchPath);
            }
        }
    }
    console.debug('discovered sketches in workspace folder ' + folder.uri.toString() + ': ' + JSON.stringify(sketchPaths, null, 2));
    return sketchPaths;
}

function getSketchPath(documentUri: Uri): string | undefined {
    if (documentUri.scheme === 'file') {
        const documentPath = documentUri.fsPath;
        const sketchPaths = sortedSketches();
        for (const sketchPath of sketchPaths) {
            if (documentPath.startsWith(sketchPath)) {
                return sketchPath;
            }
        }
    }
    return undefined;
}

interface LanguageServerExecutables {
    readonly lsPath: string;
    readonly clangdPath: string;
    readonly cliPath: string;
}
namespace LanguageServerExecutables {
    export function fromDir(dirPath: string): LanguageServerExecutables {
        const appRootPath = fromAppRootPath();
        return appendExeOnWindows({
            cliPath: path.join(dirPath, appRootPath, 'arduino-cli'),
            lsPath: path.join(dirPath, appRootPath, 'arduino-language-server'),
            clangdPath: path.join(dirPath, appRootPath, 'clangd'),
        });
    }
    export async function validate(executables: LanguageServerExecutables): Promise<void> {
        await Promise.all(Object.values(executables).map(canExecute));
    }
    export async function canExecute(pathToExecutable: string): Promise<void> {
        return fs.access(pathToExecutable, constants.X_OK);
    }
    function appendExeOnWindows(executables: LanguageServerExecutables): LanguageServerExecutables {
        if (process.platform === 'win32') {
            const exe = '.exe';
            return {
                cliPath: executables.cliPath + exe,
                lsPath: executables.lsPath + exe,
                clangdPath: executables.clangdPath + exe,
            };
        }
        return executables;
    }
    function fromAppRootPath(): string {
        const defaultPath = path.join('app', 'node_modules', 'arduino-ide-extension', 'build');
        switch (process.platform) {
            case 'win32':
            case 'linux':
                return path.join('resources', defaultPath);
            case 'darwin':
                return path.join('Contents', 'Resources', defaultPath);
            default:
                throw new Error(`Unsupported platform: ${process.platform}`);
        }
    }
}

interface LanguageServerConfig {
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
    readonly realTimeDiagnostics?: boolean;
}

interface DebugConfig {
    readonly cliPath?: string;
    readonly cliDaemonAddr?: string;
    readonly board: {
        readonly fqbn: string;
        readonly name?: string;
    }
    readonly sketchPath: string;
    /**
     * Location where the `launch.config` will be created on the fly before starting every debug session.
     * If not defined, it falls back to `sketchPath/.vscode/launch.json`.
     */
    readonly configPath?: string;
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

interface SketchContext {
    languageClient?: LanguageClient | undefined;
    languageServerDisposable?: vscode.Disposable | undefined;
    latestConfig?: LanguageServerConfig | undefined;
    crashCount: number;
    readonly mutex: MutexInterface;
}

function signalLanguageServerStateChange(ready: boolean): void {
    vscode.commands.executeCommand('setContext', 'inoLSReady', ready);
}
function signalDiscoveredSketches(has: boolean): void {
    vscode.commands.executeCommand('setContext', 'discoveredSketches', has);
}

let ide2Path: string | undefined;
let executables: LanguageServerExecutables | undefined;

function useIde2Path(ide2PathToUse: string | undefined = vscode.workspace.getConfiguration('arduinoTools').get('ide2Path')): string | undefined {
    ide2Path = ide2PathToUse;
    executables = findExecutables();
    if (executables) {
        vscode.window.showInformationMessage(`Executables: ${JSON.stringify(executables)}`);
    }
    return ide2Path;
}
function findExecutables(): LanguageServerExecutables | undefined {
    if (!ide2Path) {
        return undefined;
    }
    return LanguageServerExecutables.fromDir(ide2Path);
}

interface CompileResult {
    readonly builder_result: { build_path: string };
}
interface Platform {
    readonly boards: Board[];
}
interface Board {
    readonly name: string;
    readonly fqbn?: string;
}
namespace Board {
    export function installed(board: Board): board is Board & { fqbn: string } {
        return !!board.fqbn;
    }
}

export function activate(context: ExtensionContext) {
    function didOpenTextDocument(document: TextDocument): void {
        const documentUri = document.uri;
        const folder = vscode.workspace.getWorkspaceFolder(documentUri);
        if (!folder) {
            return;
        }
        const sketch = getSketchPath(documentUri);
        if (!sketch) {
            return;
        }

        if (!getOrCreateContext(sketch)) {
            vscode.window.showErrorMessage(`Could not location sketch under ${sketch}`);
        }
    }
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            _sortedSketches = undefined;
            signalDiscoveredSketches(false);
        }),
        vscode.workspace.onDidOpenTextDocument(didOpenTextDocument),
        vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            for (const folder of event.removed) {
                const removedSketches = discoverSketchesInFolder(folder);
                for (const removedSketch of removedSketches) {
                    const context = sketchContexts.get(removedSketch);
                    if (context) {
                        sketchContexts.delete(removedSketch);
                        stopLanguageServer(context);
                    }
                }
            }
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('arduinoTools.ide2Path')) {
                useIde2Path();
            }
        }),
        vscode.commands.registerCommand('arduino.languageserver.start', async () => {
            const sketch = await selectSketch();
            if (!sketch) {
                return;
            }
            const sketchContext = getOrCreateContext(sketch);
            if (!sketchContext) {
                return;
            }
            const unlock = await sketchContext.mutex.acquire();
            try {
                const fqbn = await selectFqbn();
                if (fqbn) {
                    await startLanguageServer(context, sketchContext, { board: { fqbn } });
                    signalLanguageServerStateChange(true);
                }
                return false;
            } catch (err) {
                console.error('Failed to start the language server.', err);
                signalLanguageServerStateChange(false);
                throw err;
            } finally {
                unlock();
            }
        }),
        vscode.commands.registerCommand('arduino.languageserver.stop', async () => {
            const sketch = await selectSketch();
            if (!sketch) {
                return;
            }
            const sketchContext = getOrCreateContext(sketch);
            if (!sketchContext) {
                return;
            }
            const unlock = await sketchContext.mutex.acquire();
            try {
                await stopLanguageServer(sketchContext);
                signalLanguageServerStateChange(false);
            } finally {
                unlock();
            }
        }),
        vscode.commands.registerCommand('arduino.debug.start', (config: DebugConfig) => startDebug(context, config)),
        vscode.commands.registerCommand('arduino.cli.verify', async () => {
            const sketch = await selectSketch();
            if (!sketch) {
                return;
            }
            const sketchContext = sketchContexts.get(sketch);
            let fqbn: string | undefined = undefined;
            if (sketchContext) {
                sketchContext.latestConfig?.board.fqbn;
            }
            if (!fqbn) {
                fqbn = await selectFqbn();
            }
            if (!fqbn) {
                return;
            }
            const raw = await cliExec(['compile', '-b', fqbn, sketch]);
            const languageClient = sketchContext?.languageClient;
            if (languageClient) {
                const result = JSON.parse(raw) as CompileResult;
                const buildOutputUri = Uri.file(result.builder_result.build_path).toString();
                languageClient.sendNotification(DidCompleteBuildNotification.TYPE, { buildOutputUri });

            }
        }),
    );
    sortedSketches();
    vscode.workspace.textDocuments.forEach(didOpenTextDocument);
    useIde2Path();
}

async function selectSketch(): Promise<string | undefined> {
    const sketches = sortedSketches();
    if (!sketches.length) {
        return undefined;
    }
    if (sketches.length === 1) {
        return sketches[0];
    }
    const items = sketches.map(sketch => ({ label: path.basename(sketch), description: sketch, sketch }));
    const item = await vscode.window.showQuickPick(items, { matchOnDescription: true, placeHolder: 'Select a sketch' });
    return item?.sketch;
}

async function selectFqbn(): Promise<string | undefined> {
    if (executables) {
        const boards = await installedBoards();
        const items = boards.map(({ name, fqbn }) => ({ label: name, description: fqbn, name, fqbn }));
        const item = await vscode.window.showQuickPick(items, { matchOnDescription: true, placeHolder: 'Select a board to enable the Arduino language features' });
        return item?.fqbn;
    }
    return undefined;
}
async function coreList(): Promise<Platform[]> {
    const raw = await cliExec(['core', 'list', '--format', 'json']);
    return JSON.parse(raw) as Platform[];
}
async function installedBoards(): Promise<(Board & { fqbn: string })[]> {
    const platforms = await coreList();
    return platforms.map(({ boards }) => boards).reduce((acc, curr) => {
        acc.push(...curr);
        return acc;
    }, [] as Board[]).filter(Board.installed);
}

async function cliExec(args: string[] = []): Promise<string> {
    if (!executables) {
        throw new Error("Could not find the Arduino executables. Did you set the 'ide2Path' correctly?");
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    return new Promise((resolve, reject) => {
        const child = cp.spawn(`"${executables?.cliPath}"`, args, { shell: true });
        child.stdout.on('data', (data) => out.push(data));
        child.stderr.on('data', (data) => err.push(data));
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                return resolve(Buffer.concat(out).toString('utf-8'));
            } else {
                return reject(Buffer.concat(err).toString('utf-8'));
            }
        });
    });
};

async function startDebug(_: ExtensionContext, config: DebugConfig): Promise<boolean> {
    let info: DebugInfo | undefined = undefined;
    let rawStdout: string | undefined = undefined;
    let rawStdErr: string | undefined = undefined;
    try {
        const args = ['debug', '-I', '-b', config.board.fqbn, config.sketchPath, '--format', 'json'];
        const { stdout, stderr } = spawnSync(config?.cliPath || '.', args, { encoding: 'utf8' });
        rawStdout = stdout.trim();
        rawStdErr = stderr.trim();
    } catch (err) {
        showError(err);
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
        console.error(`Could not parse JSON: <${rawStdout}>`);
        showError(err);
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
        const raw = await fs.readFile(path.join(config.sketchPath, 'debug_custom.json'), { encoding: 'utf8' });
        customDebugConfig = JSON.parse(raw);
    } catch { }
    const mergedDebugConfig = deepmerge(defaultDebugConfig, customDebugConfig);
    const launchConfig = {
        version: '0.2.0',
        'configurations': [
            {
                ...mergedDebugConfig
            }
        ]
    };
    await updateLaunchConfig(config, launchConfig);
    return vscode.debug.startDebugging(undefined, mergedDebugConfig);
}

async function stopLanguageServer(sketchContext: SketchContext): Promise<void> {
    if (sketchContext.languageClient) {
        if (sketchContext.languageClient.diagnostics) {
            sketchContext.languageClient.diagnostics.clear();
        }
        await sketchContext.languageClient.stop();
        sketchContext.languageClient = undefined;
        if (sketchContext.languageServerDisposable) {
            sketchContext.languageServerDisposable.dispose();
            sketchContext.languageServerDisposable = undefined;
        }
    }
}

async function startLanguageServer(context: ExtensionContext, sketchContext: SketchContext, config: LanguageServerConfig): Promise<boolean> {
    await stopLanguageServer(sketchContext);
    if (!executables) {
        vscode.window.showErrorMessage("Failed to start the language server. Could not find the Arduino executables. Did you set the 'ide2Path' correctly?");
        return false;
    }

    if (!sketchContext.languageClient || !deepEqual(sketchContext.latestConfig, config)) {
        sketchContext.latestConfig = config;
        sketchContext.languageClient = await buildLanguageClient(Object.assign(config, executables), sketchContext);
        sketchContext.crashCount = 0;
    }

    sketchContext.languageServerDisposable = sketchContext.languageClient.start();
    context.subscriptions.push(sketchContext.languageServerDisposable);
    await sketchContext.languageClient.onReady();
    return true;
}

async function buildLanguageClient(config: LanguageServerConfig & LanguageServerExecutables, sketchContext: SketchContext): Promise<LanguageClient> {
    const { lsPath: command, clangdPath, board, flags, env, log } = config;
    const args = ['-cli', config.cliPath, '-cli-config', path.join(os.homedir(), '.arduinoIDE/arduino-cli.yaml'), '-clangd', clangdPath, '-fqbn', board.fqbn ?? 'arduino:avr:uno', '-skip-libraries-discovery-on-rebuild'];
    if (board.name) {
        args.push('-board-name', board.name);
    }
    if (typeof config.realTimeDiagnostics === 'boolean' && !config.realTimeDiagnostics) {
        args.push('-no-real-time-diagnostics');
    }
    if (flags && flags.length) {
        args.push(...flags);
    }
    if (!!log) {
        args.push('-log');
        let logPath: string | undefined = undefined;
        if (typeof log === 'string') {
            try {
                const stats = await fs.stat(log);
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
                    sketchContext.crashCount++;
                    if (sketchContext.crashCount < 5) {
                        return CloseAction.Restart;
                    }
                    return CloseAction.DoNotRestart;
                }
            }
        }
    );
}

function showError(err: unknown): void {
    console.error(err);
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);
    vscode.window.showErrorMessage(message);
}

/**
 * Instead of writing the `launch.json` to the workspace, the file is written to the temporary binary output location.
 */
async function updateLaunchConfig(debugConfig: DebugConfig, launchConfig: object): Promise<void> {
    if (debugConfig.configPath) {
        await fs.mkdir(debugConfig.configPath, { recursive: true });
        await fs.writeFile(path.join(debugConfig.configPath, 'launch.json'), JSON.stringify(launchConfig, null, 2));
    } else {
        const configuration = vscode.workspace.getConfiguration();
        await configuration.update('launch', launchConfig, false);
    }
}
