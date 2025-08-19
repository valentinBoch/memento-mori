import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // on garde le manifest public existant
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: [
        "favicon/favicon.ico",
        "favicon/apple-touch-icon.png",
        "favicon/favicon.svg",
      ],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
});
