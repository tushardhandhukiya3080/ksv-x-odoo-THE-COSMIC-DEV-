/**
 * @file webpack.config.js
 * @description Webpack 5 build config for the VendorBridge Sidekick extension.
 *
 * Produces three independent bundles:
 *  - dist/background.js  → MV3 Service Worker (ES module target)
 *  - dist/popup.js       → Popup UI script
 *  - dist/content.js     → Content script (injected into every page)
 *
 * CopyWebpackPlugin mirrors static assets (manifest, HTML, icons) into /dist
 * so the entire /dist folder is the installable extension.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import("webpack").Configuration} */
module.exports = {
  mode: "production",

  /**
   * Multiple entry points produce independent bundles.
   * Each Chrome extension component must be a separate file.
   */
  entry: {
    background: "./src/background.js",
    popup:      "./src/popup.js",
    content:    "./src/content.js",
  },

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    /**
     * MV3 service workers support ES modules natively.
     * Setting module output allows top-level await and clean tree-shaking.
     */
    chunkFormat: "module",
    /**
     * Clean dist on every build to avoid stale artefacts.
     */
    clean: true,
  },

  /**
   * Target "web" + experiments.outputModule enables ES module output.
   * This is required because manifest.json declares "type": "module" for the
   * background service worker.
   */
  target: "web",
  experiments: {
    outputModule: true,
  },

  module: {
    rules: [
      {
        /**
         * Babel transpiles modern JS/ES2022 syntax for broader compatibility.
         * We keep it minimal — no framework, just syntax transforms.
         */
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: { chrome: "116" },
                  modules: false, // preserve ESM for tree-shaking
                },
              ],
            ],
          },
        },
      },
    ],
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        /**
         * Copy the manifest from the project root into dist/.
         * We keep manifest.json at the root so it's easy to find and edit.
         */
        { from: "manifest.json", to: "manifest.json" },

        /**
         * Copy all icon assets.
         */
        { from: "icons", to: "icons" },

        /**
         * Copy the popup HTML file.
         */
        { from: "src/popup.html", to: "popup.html" },
      ],
    }),
  ],

  /**
   * Source maps: use inline-source-map for development, none for production
   * builds submitted to the Chrome Web Store (reduces bundle size and avoids
   * exposing internal structure).
   */
  devtool: process.env.NODE_ENV === "development" ? "inline-source-map" : false,

  resolve: {
    extensions: [".js"],
  },

  /**
   * Suppress the "bundle size over 244 KiB" warning for the background worker.
   * socket.io-client is intentionally bundled and its size is acceptable.
   */
  performance: {
    hints: false,
  },
};
