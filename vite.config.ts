/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// Base configurable para GitHub Pages (repo/) o Cloudflare Pages (/).
// Define VITE_BASE_PATH en build si despliegas en GitHub Pages, p.ej. "/swu-deck-collection-checker/"
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "SWU Deck Collection Checker",
        short_name: "SWU Checker",
        description:
          "Comprueba si tu colección de Star Wars: Unlimited cubre las cartas de un mazo.",
        theme_color: "#0b1021",
        background_color: "#0b1021",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,json,svg,png,ico,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "swu-card-images-v2",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"]
  }
});
