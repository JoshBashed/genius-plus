import path from "node:path";
import { defineConfig } from "@rspack/cli";
import { type Compiler, rspack } from "@rspack/core";
import pkg from "./package.json";
import { createManifest } from "./src/manifest";

/** `--mode` reaches `NODE_ENV` too late for this file. */
const isDev = !process.argv.includes("production");

/** Emits `manifest.json` from `src/manifest.ts`, so the two cannot drift. */
const manifestPlugin = {
    apply: (compiler: Compiler) => {
        compiler.hooks.thisCompilation.tap("manifest", (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: "manifest",
                    stage: rspack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
                },
                () => {
                    const manifest = createManifest(pkg.version, isDev);
                    compilation.emitAsset(
                        "manifest.json",
                        new rspack.sources.RawSource(
                            `${JSON.stringify(manifest, null, 4)}\n`,
                        ),
                    );
                },
            );
        });
    },
};

/** One entry per extension surface; each ships as a single file. */
export default defineConfig({
    mode: isDev ? "development" : "production",
    // MV3 forbids `eval`, so never fall back to an eval-based devtool.
    devtool: isDev ? "cheap-module-source-map" : false,
    entry: {
        background: "./src/background/index.ts",
        "content/genius": "./src/content/genius/index.ts",
        "content/genius-main": "./src/content/genius/mainWorld.ts",
        "content/soundcloud": "./src/content/soundcloud/index.tsx",
        "content/soundcloud-main": "./src/content/soundcloud/mainWorld.ts",
        "content/apple-music": "./src/content/appleMusic/index.tsx",
        "content/genius-early": "./src/content/genius/early.ts",
        popup: "./src/popup/index.tsx",
    },
    output: {
        path: path.resolve("dist"),
        filename: "[name].js",
        clean: true,
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"],
        alias: {
            "@": path.resolve("src"),
            // Genius JSX builds elements with the page's React.
            "@page-react/jsx-runtime": path.resolve(
                "src/content/genius/react/jsxRuntime.ts",
            ),
            "@page-react/jsx-dev-runtime": path.resolve(
                "src/content/genius/react/jsxRuntime.ts",
            ),
        },
    },
    module: {
        rules: [
            {
                // This directory renders into Genius's React, not ours.
                test: /\.[jt]sx?$/,
                include: /src[\\/]content[\\/]genius/,
                loader: "builtin:swc-loader",
                options: {
                    jsc: {
                        parser: { syntax: "typescript", tsx: true },
                        transform: {
                            react: {
                                runtime: "automatic",
                                importSource: "@page-react",
                                development: isDev,
                            },
                        },
                        target: "es2022",
                    },
                },
            },
            {
                test: /\.[jt]sx?$/,
                exclude: [/node_modules/, /src[\\/]content[\\/]genius/],
                loader: "builtin:swc-loader",
                options: {
                    jsc: {
                        parser: {
                            syntax: "typescript",
                            tsx: true,
                        },
                        transform: {
                            react: {
                                runtime: "automatic",
                                development: isDev,
                            },
                        },
                        target: "es2022",
                    },
                },
            },
            {
                // A string, because it is injected into a shadow root.
                test: /\.css$/,
                type: "asset/source",
                use: ["postcss-loader"],
            },
        ],
    },
    plugins: [
        manifestPlugin,
        new rspack.HtmlRspackPlugin({
            template: "./src/popup/index.html",
            filename: "popup.html",
            chunks: ["popup"],
            scriptLoading: "defer",
        }),
        new rspack.CopyRspackPlugin({
            patterns: [{ from: "public", to: "." }],
        }),
    ],
    optimization: {
        // Content scripts cannot load extra chunks at runtime.
        splitChunks: false,
        runtimeChunk: false,
    },
    performance: {
        hints: false,
    },
    stats: "errors-warnings",
});
