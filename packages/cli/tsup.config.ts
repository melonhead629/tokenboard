import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  // Bundle everything EXCEPT better-sqlite3 (native module)
  noExternal: [
    "@tokenboard/shared",
    "commander",
    "chalk",
    "cli-table3",
    "open",
  ],
  external: ["better-sqlite3"],
  platform: "node",
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Ensure the output file is executable
  onSuccess: "chmod +x dist/index.js",
});
