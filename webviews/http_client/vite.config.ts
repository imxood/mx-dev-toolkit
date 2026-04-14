import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const projectRoot = __dirname;
const outputRoot = path.resolve(projectRoot, "../../media/http_client");

export default defineConfig({
  root: projectRoot,
  publicDir: false,
  appType: "custom",
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2022",
    outDir: outputRoot,
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        workbench: path.resolve(projectRoot, "workbench/main.tsx"),
        sidebar: path.resolve(projectRoot, "sidebar/main.tsx"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: (assetInfo) => {
          const rawName = assetInfo.names?.[0] ?? assetInfo.name ?? "asset";
          const extension = path.extname(rawName);
          const baseName = path.basename(rawName, extension);

          if (extension === ".css") {
            return `${baseName}.css`;
          }

          return `assets/${baseName}-[hash][extname]`;
        },
      },
    },
  },
});
