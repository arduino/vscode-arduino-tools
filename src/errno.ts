export function isENOENT(arg: unknown): arg is Error & { code: 'ENOENT' } {
  return arg instanceof Error && 'code' in arg && arg.code === 'ENOENT';
}
