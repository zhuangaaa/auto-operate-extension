const JavaScriptObfuscator = require('webpack-obfuscator');
const TerserPlugin = require('terser-webpack-plugin');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
    entry: {
        background: path.resolve(__dirname, 'background.js'),
        content: path.resolve(__dirname, 'content.js'),
        'popup/popup': path.resolve(__dirname, 'popup/popup.js')
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].bundle.js',
        publicPath: '' // 修改为相对路径
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    mangle: {
                        reserved: [
                            'chrome', 'runtime', 'tabs', 'alarms', 'storage',
                            'onMessage', 'sendMessage', 'onInstalled', 'create',
                            'executeScript', 'scripting', 'activeTab', 'windows',
                            'action', 'webRequest', 'webNavigation'
                        ]
                    }
                }
            })
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            filename: 'popup/popup.html',
            template: path.resolve(__dirname, 'popup/popup.html'),
            chunks: isProduction ? ['popup/popup'] : [], // 仅生产环境注入bundle
            inject: isProduction ? 'body' : false, // 开发环境不自动注入
            publicPath: '/'
        }),
        new JavaScriptObfuscator(
            {
                rotateStringArray: true,
                selfDefending: false,  // 关闭反调试
                stringArray: true,
                stringArrayThreshold: 0.75,
                identifierNamesGenerator: 'hexadecimal',
                transformObjectKeys: false,  // 必须关闭对象键名混淆
                disableConsoleOutput: false,
                reservedNames: [
                    '^chrome$',
                    '^runtime$',
                    '^tabs$',
                    '^alarms$',
                    '^storage$',
                    '^onMessage$',
                    '^sendMessage$',
                    '^executeScript$'
                ],
                reservedStrings: [
                    'chrome.runtime',
                    'chrome.tabs',
                    'chrome.scripting',
                    'chrome.action'
                ]
            },
            [
                'excluded.js',
                'vendor/*.js'
            ]
        ),
        new WebpackManifestPlugin({
            generate: () => ({
                manifest_version: 3,
                name: "自动操作控制台",
                version: "1.0",
                permissions: ["activeTab", "scripting", "storage", "tabs", "alarms"],
                action: {
                    default_popup: "popup/popup.html"
                },
                icons: {
                    "16": "icons/icon16.png",
                    "48": "icons/icon48.png",
                    "128": "icons/icon128.png"
                },
                background: { service_worker: 'background.bundle.js' },
                content_scripts: [{
                    matches: ["https://qianji.alibaba-inc.com/*"],
                    js: ['content.bundle.js']
                }]
            }),
            serialize: manifest => JSON.stringify(manifest, null, 2)
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'popup',
                    to: 'popup',
                    globOptions: {
                        ignore: isProduction
                            ? ['**/*.js', '**/*.html']  // 生产环境忽略源文件
                            : ['**/*.html']  // 开发环境只忽略HTML
                    }
                },
                {
                    from: 'icons',
                    to: 'icons'
                }
            ]
        })
    ],
    mode: 'production'
};