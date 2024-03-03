import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import temp from 'temp';
import { ArduinoDebugLaunchConfig, DebugInfo, __tests__ } from '../../debug';
import { BoardIdentifier } from '../../typings';

const {
  createConfigId,
  createName,
  buildDebugInfoArgs,
  parseRawDebugInfo,
  resolveCliConfigPath,
  isCustomDebugConfig,
  mergeLaunchConfig,
  updateLaunchConfigs,
  isCommandError,
  loadDebugCustomJson,
  parseCustomDebugConfigs,
} = __tests__;

describe('debug', () => {
  describe('buildDebugInfoArgs', () => {
    type TestMe = typeof buildDebugInfoArgs;
    type Params = Parameters<TestMe>[0];
    type Result = ReturnType<TestMe>;

    it('should build args when programmer is set but no CLI config', () => {
      const expected: Result = {
        file: '/path/to/cli',
        args: [
          'debug',
          '--info',
          '--fqbn',
          'a:b:c',
          '--programmer',
          'prog1',
          '/path/to/sketch',
          '--format',
          'json',
        ],
      };
      const params: Params = {
        board: {
          fqbn: 'a:b:c',
        },
        cliPath: '/path/to/cli',
        programmer: 'prog1',
        sketchPath: '/path/to/sketch',
      };
      const actual = buildDebugInfoArgs(params);
      assert.deepStrictEqual(actual, expected);
    });

    it('should build args when programmer is unset and no CLI config', () => {
      const expected: Result = {
        file: '/path/to/cli',
        args: [
          'debug',
          '--info',
          '--fqbn',
          'a:b:c',
          '/path/to/sketch',
          '--format',
          'json',
        ],
      };
      const params: Params = {
        board: {
          fqbn: 'a:b:c',
        },
        cliPath: '/path/to/cli',
        sketchPath: '/path/to/sketch',
      };
      const actual = buildDebugInfoArgs(params);
      assert.deepStrictEqual(actual, expected);
    });

    it('should build args with programmer and CLI config path', () => {
      const expected: Result = {
        file: 'C:\\path\\to\\cli.exe',
        args: [
          'debug',
          '--info',
          '--fqbn',
          'a:b:c',
          '--programmer',
          'prog1',
          '/path/to/sketch',
          '--config-file',
          '/path/to/arduino-cli.yaml',
          '--format',
          'json',
        ],
      };
      const params: Params = {
        board: {
          fqbn: 'a:b:c',
        },
        cliPath: 'C:\\path\\to\\cli.exe',
        sketchPath: '/path/to/sketch',
        programmer: 'prog1',
        cliConfigPath: '/path/to/arduino-cli.yaml',
      };
      const actual = buildDebugInfoArgs(params);
      assert.deepStrictEqual(actual, expected);
    });
  });

  describe('mergeLaunchConfig', () => {
    const fqbn = 'a:b:c';
    const programmer = 'p1';
    const configId = `${fqbn}:programmer=${programmer}`;
    const board: BoardIdentifier = { fqbn, name: 'ABC' };
    const executable = 'path/to/bin';
    const defaultDebugConfigFragment = {
      configId,
      cwd: '${workspaceRoot}',
      executable,
      name: 'ABC (p1)',
      request: 'launch',
      type: 'cortex-debug',
    } as const;

    it('should merge launch config', async () => {
      const actual = await mergeLaunchConfig(
        board,
        programmer,
        { executable },
        []
      );
      assert.deepStrictEqual(actual, {
        configId,
        cwd: '${workspaceRoot}',
        executable,
        name: 'ABC (p1)',
        request: 'launch',
        type: 'cortex-debug',
      });
    });

    it('should merge with a custom config', async () => {
      const actual = await mergeLaunchConfig(
        board,
        programmer,
        { executable },
        [{ configId, cwd: 'alma' }]
      );
      assert.deepStrictEqual(actual, {
        configId,
        cwd: 'alma',
        executable,
        name: 'ABC (p1)',
        request: 'launch',
        type: 'cortex-debug',
      });
    });

    it('should use the ID as the debug config name when the board name is absent', async () => {
      const actual = await mergeLaunchConfig(
        {
          fqbn,
        },
        programmer,
        { executable },
        [{ configId }]
      );
      assert.deepStrictEqual(actual, {
        configId,
        cwd: '${workspaceRoot}',
        executable,
        name: `Arduino (${configId})`,
        request: 'launch',
        type: 'cortex-debug',
      });
    });

    type Config = Parameters<typeof mergeLaunchConfig>[2];
    interface TestInput<T extends keyof Config> {
      key: T;
      value: Config[T];
    }
    type TestExpectation = ArduinoDebugLaunchConfig;
    interface TestParams<T extends keyof Config> extends TestInput<T> {
      expected: TestExpectation;
    }
    function createTestInput<T extends keyof Config>(
      key: T,
      value: Config[T]
    ): TestInput<T> {
      return { key, value };
    }

    const testParams: TestParams<keyof Config>[] = [
      {
        ...createTestInput('serverPath', '/path/to/server'),
        expected: {
          ...defaultDebugConfigFragment,
          serverpath: '/path/to/server',
        },
      },
      {
        ...createTestInput('server', 'jlink'),
        expected: {
          ...defaultDebugConfigFragment,
          servertype: 'jlink',
        },
      },
      {
        ...createTestInput('toolchainPath', '/path/to/toolchain'),
        expected: {
          ...defaultDebugConfigFragment,
          armToolchainPath: '/path/to/toolchain',
        },
      },
      {
        ...createTestInput('serverConfiguration', {
          scripts: ['path/to/my/script', 'path/to/another/script'],
        }),
        expected: {
          ...defaultDebugConfigFragment,
          configFiles: ['path/to/my/script', 'path/to/another/script'],
        },
      },
    ];

    testParams.map(({ key, value, expected }) =>
      it(`should remap the CLI's '${key}' property name to 'cortex-debug'`, async () => {
        const actual = await mergeLaunchConfig(
          board,
          programmer,
          {
            executable,
            [key]: value,
          },
          []
        );
        assert.deepStrictEqual(actual, expected);
      })
    );
  });

  describe('parseRawDebugInfo', () => {
    it('should not parse invalid JSON input', async () => {
      const actual = await parseRawDebugInfo('alma');
      assert.strictEqual(actual, undefined);
    });

    it('should reject when executable is missing', async () => {
      await assert.rejects(
        parseRawDebugInfo(JSON.stringify({ alma: 'korte' })),
        /'executable' is missing from the debugger configuration/
      );
    });

    it('should parse any valid raw JSON object string', async () => {
      const actual = await parseRawDebugInfo(
        JSON.stringify({ alma: 'korte', executable: 'e' })
      );
      assert.deepStrictEqual(actual, { alma: 'korte', executable: 'e' });
    });

    it('should parse any valid JSON object', async () => {
      const actual = await parseRawDebugInfo({
        alma: 'korte',
        executable: 'e',
      });
      assert.deepStrictEqual(actual, { alma: 'korte', executable: 'e' });
    });

    it('should handle nested snake case props', async () => {
      const actual = await parseRawDebugInfo(
        JSON.stringify({ alma_korte: { korte_alma: 'foo' }, executable: 'e' })
      );
      assert.deepStrictEqual(actual, {
        almaKorte: { korteAlma: 'foo' },
        executable: 'e',
      });
    });

    it("should not map children of 'custom_configs'", async () => {
      const actual = await parseRawDebugInfo(
        JSON.stringify({
          alma_korte: { korte_alma: 'foo' },
          custom_configs: { foo_bar: 'baz' },
          executable: 'e',
        })
      );
      assert.deepStrictEqual(actual, {
        almaKorte: { korteAlma: 'foo' },
        customConfigs: { foo_bar: 'baz' },
        executable: 'e',
      });
    });

    it('should parse a valid JSON object', async () => {
      const raw = `
      {
        "executable": "/private/var/folders/z1/xkw1yh5n7rz4n8djprp1mdn80000gn/T/arduino/sketches/A051B7F4F3A6DA790A80412CD0106F8D/minimal.ino.elf",
        "toolchain": "gcc",
        "toolchain_path": "/path/to/directories.data/packages/esp32/tools/xtensa-esp-elf-gdb/11.2_20220823/bin/",
        "toolchain_prefix": "xtensa-esp32s3-elf-",
        "server": "openocd",
        "server_path": "/path/to/directories.data/packages/esp32/tools/openocd-esp32/v0.11.0-esp32-20221026/bin/openocd",
        "server_configuration": {
          "path": "/path/to/directories.data/packages/esp32/tools/openocd-esp32/v0.11.0-esp32-20221026/bin/openocd",
          "scripts_dir": "/path/to/directories.data/packages/esp32/tools/openocd-esp32/v0.11.0-esp32-20221026/share/openocd/scripts/",
          "scripts": [
            "debug.cfg"
          ]
        },
        "custom_configs": {
          "cortex-debug": {
            "breakAfterReset": "0"
          }
        },
        "programmer": "esptool"
      }
      `.trim();
      const expected: DebugInfo = {
        executable:
          '/private/var/folders/z1/xkw1yh5n7rz4n8djprp1mdn80000gn/T/arduino/sketches/A051B7F4F3A6DA790A80412CD0106F8D/minimal.ino.elf',
        toolchain: 'gcc',
        toolchainPath:
          '/path/to/directories.data/packages/esp32/tools/xtensa-esp-elf-gdb/11.2_20220823/bin/',
        toolchainPrefix: 'xtensa-esp32s3-elf-',
        server: 'openocd',
        serverPath:
          '/path/to/directories.data/packages/esp32/tools/openocd-esp32/v0.11.0-esp32-20221026/bin/openocd',
        serverConfiguration: {
          path: '/path/to/directories.data/packages/esp32/tools/openocd-esp32/v0.11.0-esp32-20221026/bin/openocd',
          scriptsDir:
            '/path/to/directories.data/packages/esp32/tools/openocd-esp32/v0.11.0-esp32-20221026/share/openocd/scripts/',
          scripts: ['debug.cfg'],
        },
        customConfigs: {
          'cortex-debug': {
            breakAfterReset: '0',
          },
        },
        programmer: 'esptool',
      };
      const actual = await parseRawDebugInfo(raw);
      assert.ok(actual);
      assert.deepStrictEqual(actual, expected);
    });
  });

  describe('resolveCliConfigPath', () => {
    it('should use the CLI config file path from params if present', () => {
      const actual = resolveCliConfigPath({ cliConfigPath: '/path/to/config' });
      assert.strictEqual(actual, '/path/to/config');
    });
    it('should fallback to IDE2 default location if absent from params', () => {
      const actual = resolveCliConfigPath({});
      assert.strictEqual(
        actual,
        path.join(os.homedir(), '.arduinoIDE', 'arduino-cli.yaml')
      );
    });
  });

  describe('createConfigId', () => {
    it('should create the configuration ID when the FQBN has no custom board options', () => {
      const actual = createConfigId({ fqbn: 'a:b:c' }, 'p');
      assert.strictEqual(actual, 'a:b:c:programmer=p');
    });

    it('should create the configuration ID when the FQBN has no custom board options (no programmer)', () => {
      const actual = createConfigId({ fqbn: 'a:b:c' }, undefined);
      assert.strictEqual(actual, 'a:b:c');
    });

    it('should create the configuration ID when the FQBN has custom board options', () => {
      const actual = createConfigId({ fqbn: 'a:b:c:o1=v1' }, 'p');
      assert.strictEqual(actual, 'a:b:c:o1=v1,programmer=p');
    });

    it('should create the configuration ID when the FQBN has custom board options (no programmer)', () => {
      const actual = createConfigId({ fqbn: 'a:b:c:o1=v1' }, undefined);
      assert.strictEqual(actual, 'a:b:c:o1=v1');
    });
  });
  describe('createName', () => {
    it('should use the generated config ID if the board name is absent', () => {
      const board = { fqbn: 'a:b:c' };
      const programmer = 'p1';
      const actual = createName(board, programmer);
      assert.strictEqual(actual, 'Arduino (a:b:c:programmer=p1)');
    });

    it('should use the generated config ID with the custom board options if the board name is absent', () => {
      const board = { fqbn: 'a:b:c:UsbMode=default' };
      const programmer = 'p1';
      const actual = createName(board, programmer);
      assert.strictEqual(
        actual,
        'Arduino (a:b:c:UsbMode=default,programmer=p1)'
      );
    });

    it('should use the generated config ID with the custom board options if the board name is absent (no programmer)', () => {
      const board = { fqbn: 'a:b:c:UsbMode=default' };
      const actual = createName(board, undefined);
      assert.strictEqual(actual, 'Arduino (a:b:c:UsbMode=default)');
    });

    it('should use the board name', () => {
      const board = { fqbn: 'a:b:c', name: 'board name' };
      const programmer = 'p1';
      const actual = createName(board, programmer);
      assert.strictEqual(actual, 'board name (p1)');
    });

    it('should use the board name (no programmer)', () => {
      const board = { fqbn: 'a:b:c', name: 'board name' };
      const actual = createName(board, undefined);
      assert.strictEqual(actual, 'board name');
    });

    it('should use the board name and all custom board options', () => {
      const board = { fqbn: 'a:b:c:UsbMode=default', name: 'board name' };
      const programmer = 'p1';
      const actual = createName(board, programmer);
      assert.strictEqual(actual, 'board name (UsbMode=default,p1)');
    });

    it('should use the board name and all custom board options (no programmer)', () => {
      const board = { fqbn: 'a:b:c:UsbMode=default', name: 'board name' };
      const actual = createName(board, undefined);
      assert.strictEqual(actual, 'board name (UsbMode=default)');
    });
  });

  describe('isCustomDebugConfig', () => {
    it("should not parse as custom debug config if 'configId' is missing", () => {
      assert.strictEqual(isCustomDebugConfig({}), false);
    });
    it("should not parse if 'configId' is not string", () => {
      assert.strictEqual(isCustomDebugConfig({ configId: 36 }), false);
    });
    it('should parse custom config with empty string config ID', () => {
      assert.strictEqual(isCustomDebugConfig({ configId: '' }), true);
    });
    it('should parse custom config with invalid ID', () => {
      assert.strictEqual(isCustomDebugConfig({ configId: 'invalid' }), true);
    });
    it('should parse custom config', () => {
      assert.strictEqual(
        isCustomDebugConfig({ configId: 'a:b:c:programmer=p' }),
        true
      );
    });
  });

  describe('isCommandError', () => {
    it('should parse a valid command error', () => {
      assert.strictEqual(isCommandError({ error: 'message' }), true);
    });
    it('should not parse: invalid type', () => {
      assert.strictEqual(isCommandError({ error: 36 }), false);
    });
    it('should not parse: missing', () => {
      assert.strictEqual(isCommandError({ Error: 'message' }), false);
    });
  });

  describe('parseCustomDebugConfigs', () => {
    it('should parse valid custom configs', () => {
      const actual = parseCustomDebugConfigs(`[
        { "configId": "a:b:c:programmer=p1", "executable": "/path/to/bin" },
        { "configId": "x:y:z:programmer=p2", "executable": "C:\\\\path\\\\to\\\\exec" }
      ]`);
      assert.deepStrictEqual(actual, [
        { configId: 'a:b:c:programmer=p1', executable: '/path/to/bin' },
        {
          configId: 'x:y:z:programmer=p2',
          executable: 'C:\\path\\to\\exec',
        },
      ]);
    });

    it('should handle invalid JSON', () => {
      const actual = parseCustomDebugConfigs('invalid');
      assert.deepStrictEqual(actual, []);
    });

    it("should skip if 'configId' is missing", () => {
      const actual = parseCustomDebugConfigs(`[
        { "configID": "a:b:c:programmer=p1", "executable": "/path/to/bin" },
        { "configId": "x:y:z:programmer=p2", "executable": "C:\\\\path\\\\to\\\\exec" }
      ]`);
      assert.deepStrictEqual(actual, [
        { configId: 'x:y:z:programmer=p2', executable: 'C:\\path\\to\\exec' },
      ]);
    });

    it("should be valid without the 'executable' property", () => {
      const actual = parseCustomDebugConfigs(
        '[{ "configId": "a:b:c:programmer=p1" }]'
      );
      assert.deepStrictEqual(actual, [{ configId: 'a:b:c:programmer=p1' }]);
    });
  });

  describe('loadDebugCustomJson', () => {
    let tracked: typeof temp;

    before(function () {
      tracked = this.currentTest?.ctx?.['tracked'];
      assert.ok(tracked);
    });

    it("should load an empty array if the 'debug_custom.json' is missing", async () => {
      const tempDirPath = await tracked.mkdir();
      const actual = await loadDebugCustomJson({ sketchPath: tempDirPath });
      assert.deepStrictEqual(actual, []);
    });

    it("should load an empty array if the 'debug_custom.json' is invalid", async () => {
      const tempDirPath = await tracked.mkdir();
      await fs.writeFile(
        path.join(tempDirPath, 'debug_custom.json'),
        'invalid',
        { encoding: 'utf8' }
      );
      const actual = await loadDebugCustomJson({ sketchPath: tempDirPath });
      assert.deepStrictEqual(actual, []);
    });

    it('should load the custom configuration', async () => {
      const tempDirPath = await tracked.mkdir();
      await fs.writeFile(
        path.join(tempDirPath, 'debug_custom.json'),
        '[{ "configId": "a:b:c:programmer=p1" }]',
        { encoding: 'utf8' }
      );
      const actual = await loadDebugCustomJson({ sketchPath: tempDirPath });
      assert.deepStrictEqual(actual, [{ configId: 'a:b:c:programmer=p1' }]);
    });

    it('should skip loading invalid custom configs', async () => {
      const tempDirPath = await tracked.mkdir();
      await fs.writeFile(
        path.join(tempDirPath, 'debug_custom.json'),
        `[{ "configID": "a:b:c:programmer=p1", "executable": "/path/to/bin" },
          { "configId": "x:y:z:programmer=p2", "executable": "C:\\\\path\\\\to\\\\exec" }]`,
        { encoding: 'utf8' }
      );
      const actual = await loadDebugCustomJson({ sketchPath: tempDirPath });
      assert.deepStrictEqual(actual, [
        { configId: 'x:y:z:programmer=p2', executable: 'C:\\path\\to\\exec' },
      ]);
    });
  });

  describe('updateLaunchConfigs', () => {
    const configId = 'a:b:c:programmer=p1';
    const otherConfigId = 'x:y:z:programmer=p2';
    const launchConfig = {
      configId,
      executable: 'C:\\path\\to\\exe',
      type: 'cortex-debug',
      name: `Arduino (${configId}})`,
      request: 'launch',
    };
    const otherLaunchConfig = {
      configId: otherConfigId,
      executable: 'path/to/bin',
      type: 'cortex-debug',
      name: `Arduino (${otherConfigId}})`,
      request: 'launch',
    };

    describe('IDE2', () => {
      let tracked: typeof temp;

      before(function () {
        tracked = this.currentTest?.ctx?.['tracked'];
        assert.ok(tracked);
      });

      it('should create the launch config if missing', async () => {
        const tempDir = await tracked.mkdir();
        await updateLaunchConfigs(tempDir, launchConfig);
        const actual = JSON.parse(
          await fs.readFile(path.join(tempDir, 'launch.json'), {
            encoding: 'utf8',
          })
        );
        assert.deepStrictEqual(actual, {
          version: '0.2.0',
          configurations: [launchConfig],
        });
      });

      it('should update the launch config if present', async () => {
        const tempDir = await tracked.mkdir();
        const existing = {
          version: '0.2.0',
          configurations: [launchConfig],
        };
        await fs.writeFile(
          path.join(tempDir, 'launch.json'),
          JSON.stringify(existing)
        );
        const actualExisting = JSON.parse(
          await fs.readFile(path.join(tempDir, 'launch.json'), {
            encoding: 'utf8',
          })
        );
        assert.deepStrictEqual(actualExisting, existing);

        const modifiedLaunchConfig = {
          ...launchConfig,
          executable: 'C:\\path\\to\\another\\exe',
        };
        await updateLaunchConfigs(tempDir, modifiedLaunchConfig);
        const actual = JSON.parse(
          await fs.readFile(path.join(tempDir, 'launch.json'), {
            encoding: 'utf8',
          })
        );
        assert.deepStrictEqual(actual, {
          version: '0.2.0',
          configurations: [modifiedLaunchConfig],
        });
      });

      it('should insert a new launch config', async () => {
        const tempDir = await tracked.mkdir();
        const existing = {
          version: '0.2.0',
          configurations: [otherLaunchConfig],
        };
        await fs.writeFile(
          path.join(tempDir, 'launch.json'),
          JSON.stringify(existing)
        );
        const actualExisting = JSON.parse(
          await fs.readFile(path.join(tempDir, 'launch.json'), {
            encoding: 'utf8',
          })
        );
        assert.deepStrictEqual(actualExisting, existing);

        await updateLaunchConfigs(tempDir, launchConfig);
        const actual = JSON.parse(
          await fs.readFile(path.join(tempDir, 'launch.json'), {
            encoding: 'utf8',
          })
        );
        assert.deepStrictEqual(actual, {
          version: '0.2.0',
          configurations: [otherLaunchConfig, launchConfig],
        });
      });
    });
    // describe('VS Code', () => {});
  });
});
