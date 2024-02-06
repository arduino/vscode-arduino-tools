import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import type temp from 'temp';
import { __tests__ } from '../../debug';
import { exec } from '../../exec';
import { TestEnv } from '../testEnv';

const {
  CliError,
  buildDebugInfoArgs,
  createLaunchConfig,
  isMissingProgrammerError,
} = __tests__;

describe('debug (slow)', function () {
  this.slow(2_000);

  let testEnv: TestEnv;
  let tracked: typeof temp;
  let sketchPath: string;
  let buildPath: string;

  before(async function () {
    if (os.platform() === 'win32') {
      this.skip();
    }
    this.timeout(60_000);
    testEnv = this.currentTest?.ctx?.['testEnv'];
    assert.ok(testEnv);
    tracked = this.currentTest?.ctx?.['tracked'];
    sketchPath = await newSketch(tracked);
    await compile(sketchPath, 'arduino-git:samd:nano_33_iot'); // Make sure the manually installed core works correctly
    const compileResult = await compile(sketchPath, 'arduino:esp32:nano_nora');
    buildPath = compileResult.builder_result.build_path;
  });

  describe('createLaunchConfig', () => {
    it('should create with the required custom board options (USBMode=hwcdc)', async () => {
      const configOptions = 'USBMode=hwcdc';
      const fqbn = `arduino:esp32:nano_nora:${configOptions}`;
      const name = 'the board name';
      const programmer = 'esptool';
      const actual = await createLaunchConfig({
        board: { fqbn, name },
        cliPath: testEnv.cliPath,
        cliConfigPath: testEnv.cliConfigPath,
        sketchPath,
        programmer,
      });
      const expected = {
        name: `${name} (${configOptions},${programmer})`,
        configId: 'arduino:esp32:nano_nora:USBMode=hwcdc,programmer=esptool',
        cwd: '${workspaceRoot}',
        request: 'attach',
        type: 'cortex-debug',
        executable: fromBuildPath('my_sketch.ino.elf'),
        toolchainPrefix: 'xtensa-esp32s3-elf',
        svdFile: fromDataDir(
          'packages/arduino/hardware/esp32/3.0.0-arduino3r2/tools/ide-debug/svd/esp32s3.svd'
        ),
        objdumpPath: fromDataDir(
          '/packages/esp32/tools/xtensa-esp32s3-elf-gcc/esp-12.2.0_20230208/bin/xtensa-esp32s3-elf-objdump'
        ),
        overrideAttachCommands: [
          'set remote hardware-watchpoint-limit 2',
          'monitor reset halt',
          'monitor gdb_sync',
          'interrupt',
        ],
        overrideRestartCommands: [
          'monitor reset halt',
          'monitor gdb_sync',
          'interrupt',
        ],
        serverpath: fromDataDir(
          'packages/esp32/tools/openocd-esp32/v0.12.0-esp32-20230921/bin/openocd'
        ),
        servertype: 'openocd',
        armToolchainPath: fromDataDir(
          'packages/esp32/tools/xtensa-esp-elf-gdb/12.1_20221002/bin/'
        ),
        configFiles: ['board/esp32s3-builtin.cfg'],
      };
      assert.deepStrictEqual(actual, expected);
    });

    it('should fail when the required custom board options are missing', async () => {
      const fqbn = 'arduino:esp32:nano_nora';
      const programmer = 'esptool';
      await assert.rejects(
        createLaunchConfig({
          board: { fqbn },
          cliPath: testEnv.cliPath,
          cliConfigPath: testEnv.cliConfigPath,
          sketchPath,
          programmer,
        }),
        (reason) =>
          // Bad argument
          // https://github.com/arduino/arduino-cli/blob/76ea8c1370bba856afc87232ae2755b218b23d22/internal/cli/feedback/errorcodes.go#L44
          reason instanceof CliError && reason.exitCode === 7
      );
    });

    it('should remove the programmer', async () => {
      const fqbn = 'arduino-git:samd:nano_33_iot'; // the core is available from directories.user/hardware
      const programmer = 'atmel_ice';
      const actual = await createLaunchConfig({
        board: { fqbn },
        cliPath: testEnv.cliPath,
        cliConfigPath: testEnv.cliConfigPath,
        sketchPath,
        programmer,
      });
      const expected = {
        name: `Arduino (${fqbn}:programmer=${programmer})`,
        configId: `${fqbn}:programmer=${programmer}`,
        cwd: '${workspaceRoot}',
        request: 'launch',
        type: 'cortex-debug',
        executable: fromBuildPath('my_sketch.ino.elf'),
        toolchainPrefix: 'arm-none-eabi',
        svdFile: fromUserDir('hardware/arduino-git/samd/svd/at91samd21g18.svd'),
        overrideRestartCommands: [
          'monitor reset halt',
          'monitor gdb_sync',
          'thb setup',
          'c',
        ],
        postAttachCommands: [
          'set remote hardware-watchpoint-limit 2',
          'monitor reset halt',
          'monitor gdb_sync',
          'thb setup',
          'c',
        ],
        serverpath: fromDataDir(
          'packages/arduino/tools/openocd/0.10.0-arduino7/bin/openocd'
        ),
        servertype: 'openocd',
        armToolchainPath: fromDataDir(
          'packages/arduino/tools/arm-none-eabi-gcc/7-2017q4/bin/'
        ),
        configFiles: [
          'interface/cmsis-dap.cfg',
          fromUserDir(
            'hardware/arduino-git/samd/variants/nano_33_iot/openocd_scripts/openocd.cfg'
          ),
        ],
      };
      assert.deepStrictEqual(actual, expected);
    });
  });

  it('should build the debug --info arguments', async () => {
    const { file, args } = buildDebugInfoArgs({
      board: { fqbn: 'arduino:esp32:nano_nora:USBMode=hwcdc' },
      cliPath: testEnv.cliPath,
      sketchPath,
      cliConfigPath: testEnv.cliConfigPath,
      programmer: 'esptool',
    });
    const raw = await exec(file, args);
    assert.ok(raw);
    const object = JSON.parse(raw);
    assert.ok(typeof object === 'object');
  });

  ['en', 'it'].map((locale) =>
    it(`should fail when the programmer is missing (locale: ${locale})`, async function () {
      if (!testEnv.cliConfigPaths[locale]) {
        this.skip();
      }
      await assert.rejects(
        // Can be any arbitrary board that does not have a default programmer defined in the platform. Otherwise, the error does not occur.
        cliExec(['debug', '-I', '-b', 'arduino:avr:uno', sketchPath], locale),
        (reason) => isMissingProgrammerError(reason)
      );
    })
  );

  it('should fail when the programmer is unknown', async () => {
    await assert.rejects(
      cliExec([
        'debug',
        '-I',
        '-b',
        'arduino:esp32:nano_nora:USBMode=hwcdc',
        '-P',
        'unknown',
        sketchPath,
      ]),
      (reason) =>
        reason instanceof CliError &&
        /Programmer 'unknown' not found/i.test(reason.message)
    );
  });

  async function compile(
    sketchPath: string,
    fqbn: string
  ): Promise<{ builder_result: { build_path: string } }> {
    return cliExec(['compile', '-b', fqbn, sketchPath]);
  }

  async function newSketch(
    tracked: typeof temp,
    sketchName = 'my_sketch'
  ): Promise<string> {
    const tempDir = await tracked.mkdir();
    const sketchPath = path.join(tempDir, sketchName);
    await cliExec(['sketch', 'new', sketchPath]);
    return sketchPath;
  }

  async function cliExec<T>(args: string[], locale = 'en'): Promise<T> {
    return __tests__.cliExec(
      testEnv.cliPath,
      args,
      testEnv.cliConfigPaths[locale]
    );
  }

  function fromDataDir(...paths: string[]): string {
    return path.join(testEnv.dataDirPath, ...paths);
  }

  function fromUserDir(...paths: string[]): string {
    return path.join(testEnv.userDirPath, ...paths);
  }

  function fromBuildPath(...paths: string[]): string {
    return path.join(buildPath, ...paths);
  }
});
