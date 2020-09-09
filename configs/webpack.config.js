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
        __filename: false
    },
    entry: './lib/extension.js',
    output: {
        path: path.resolve(__dirname, '..', 'dist'),
        filename: 'bundle.js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    mode: 'production',
    devtool: 'source-map',
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.js']
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
                    fileMode: '555'
                }
            ]
        })
    ]
};
module.exports = config;
