// @ts-check

const path = require('path');

/**
 * @type {import('webpack').Configuration}
 */
const config = {
    target: 'node',
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
    }
};
module.exports = config;
