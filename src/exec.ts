// @ts-expect-error type import from ES module
import type { Options } from 'execa';
export type ExecOptions = Options;

export async function exec(
  file: string,
  args: readonly string[],
  options?: Options
): Promise<string> {
  const { execa } = await import('execa');
  const { stdout } = await execa(file, args, options);
  return stdout;
}
