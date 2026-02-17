// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import { VitePWA } from "vite-plugin-pwa";

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone', // required!
  }),
  integrations: [react(), tailwind()],
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "robots.txt"],
        manifest: {
          name: "The Triangle",
          short_name: "The Triangle",
          start_url: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: "#2563EB",
          icons: [
            {
              src: "/logo.png",
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: "/logo.png",
              sizes: "512x512",
              type: "image/png"
            }
          ]
        }
      })
    ]
  }
});