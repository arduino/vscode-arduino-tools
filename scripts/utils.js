// @ts-check

const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * @param {ArrayBuffer} data
 * @param {string} targetPath
 * @returns {Promise<void>}
 */
async function decompress(data, targetPath) {
  console.log(`Decompressing to ${targetPath}`);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const [decompress, targz, unzip] = await Promise.all([
    import('decompress').then((module) => module.default),
    import('decompress-targz').then((module) => module.default),
    import('decompress-unzip').then((module) => module.default),
  ]);
  await decompress(Buffer.from(data), targetPath, {
    plugins: [targz(), unzip()],
  });
}

/**
 * @param {string} url
 * @returns {Promise<ArrayBuffer>}
 */
async function download(url) {
  console.log(`Downloading from ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Unexpected error occurred when downloading from ${url}: ${resp.statusText}`
    );
  }
  const data = await resp.arrayBuffer();
  return data;
}

module.exports = {
  download,
  decompress,
};
