import * as esbuild from "esbuild";

// The banner can't be passed on the command line because npm scripts run in
// different shells on different platforms, and they don't agree on quoting.

await esbuild.build({
  entryPoints: ["../language-server/src/server.ts"],
  bundle: true,
  outfile: "out/server.mjs",
  external: ["fsevents", "vscode"],
  mainFields: ["module", "main"],
  // The server runs in its own Node process, so it's an ES module regardless
  // of how the extension is built
  format: "esm",
  platform: "node",
  // Bundled CommonJS dependencies expect these, but ES modules don't have them
  banner: {
    js: [
      `import { createRequire as __createRequire } from "node:module";`,
      `import { fileURLToPath as __fileURLToPath } from "node:url";`,
      `import { dirname as __pathDirname } from "node:path";`,
      `const require = __createRequire(import.meta.url);`,
      `const __filename = __fileURLToPath(import.meta.url);`,
      `const __dirname = __pathDirname(__filename);`
    ].join("\n")
  },
  minify: process.argv.includes("--minify"),
  sourcemap: process.argv.includes("--sourcemap"),
  logLevel: "info"
});
