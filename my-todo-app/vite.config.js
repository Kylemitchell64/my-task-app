import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Makes the app installable and lets it open with no network at all.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // registered from src/main.jsx
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "theme.js"],
      manifest: {
        name: "Learning Tracker",
        short_name: "Tracker",
        description: "Plan what to learn, time your focus, and watch the streak grow.",
        start_url: "/",
        display: "standalone",
        background_color: "#17141b",
        theme_color: "#7a2b8c",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
