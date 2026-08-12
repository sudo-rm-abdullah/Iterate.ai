import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    webExtension({
      manifest: "src/manifest.json",
      disableAutoRegister: true,
      additionalInputs: ["src/dashboard/index.html"],
      webExtConfig: {
        startUrl: ["https://colab.research.google.com"],
      },
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
