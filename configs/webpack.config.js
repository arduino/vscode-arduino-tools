// @ts-check

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const PermissionsOutputPlugin = require('webpack-permissions-plugin');

/**
 * @type {import('webpack').Configuration}
 */
const config = {
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, '..', 'dist'),
        filename: 'bundle.js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    mode: 'none',
    devtool: 'nosources-source-map',
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
          {
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [
              {
                loader: 'ts-loader'
              }
            ]
          }
        ]
      },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: 'node_modules/vscode-languageclient/lib/utils/terminateProcess.sh',
                    to: 'terminateProcess.sh'
                }
            ]
        }),
        new PermissionsOutputPlugin({
            buildFiles: [
                {
                    path: path.resolve(__dirname, '..', 'dist', 'terminateProcess.sh'),
                    fileMode: '755'
                }
            ]
        })
    ]
};
module.exports = config;
