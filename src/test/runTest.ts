import { runTests } from '@vscode/test-electron';
import path from 'node:path';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const extensionTestsEnv = <{ [key: string]: string | undefined }>(
      JSON.parse(JSON.stringify(process.env))
    );
    const args = process.argv.splice(2);
    const all = args.includes('--all');
    if (all) {
      extensionTestsEnv.TEST_CONTEXT = 'ALL';
    } else {
      const slow = args.includes('--slow');
      if (slow) {
        extensionTestsEnv.TEST_CONTEXT = 'SLOW';
      }
    }
    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv,
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
