import { copyFileSync } from "node:fs";
import { defineConfig } from "vite";

/**
 * Files that live at the repository root but have to ship inside the system:
 * `system.json` names LICENSE, README.md and CHANGELOG.md as *relative* paths
 * so the manifest carries no hostname, which is what lets the same manifest be
 * published from anywhere.
 */
const META_FILES = ["LICENSE", "NOTICE.md", "README.md", "CHANGELOG.md"];

/**
 * Builds src/fallout.ts into dist/fallout.mjs and copies everything in
 * static/ (system.json, templates, lang, styles) verbatim into dist/.
 * dist/ is the complete installable system — symlink it into Foundry's
 * Data/systems/fallout-ttrpg.
 */
export default defineConfig({
  publicDir: "static",
  plugins: [
    {
      name: "fallout-copy-meta",
      closeBundle() {
        for (const file of META_FILES) copyFileSync(file, `dist/${file}`);
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: "src/fallout.ts",
      formats: ["es"],
      fileName: () => "fallout.mjs",
    },
  },
});
