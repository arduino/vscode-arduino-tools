// @ts-check

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const PermissionsOutputPlugin = require('webpack-permissions-plugin');

/**
 * @type {import('webpack').Configuration}
 */
const config = {
  target: 'node',
  node: {
    __dirname: false,
    __filename: false,
  },
  entry: './lib/extension.js',
  output: {
    path: path.resolve(__dirname, '..', 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  mode: 'development',
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode',
  },
  resolve: {
    extensions: ['.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/vscode-languageclient/lib/utils/terminateProcess.sh',
          to: 'terminateProcess.sh',
        },
      ],
    }),
    new PermissionsOutputPlugin({
      buildFiles: [
        {
          path: path.resolve(__dirname, '..', 'dist', 'terminateProcess.sh'),
          fileMode: '755',
        },
      ],
    }),
  ],
};
module.exports = config;
