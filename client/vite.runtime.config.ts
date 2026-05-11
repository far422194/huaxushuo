import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// 独立站打包配置：仅打包 runtime-entry，产物放到 public/runtime-template 供发布时注入 deck.json
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  publicDir: false,
  build: {
    outDir: "public/runtime-template",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "runtime.html"),
    },
  },
});
