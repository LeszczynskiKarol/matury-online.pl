import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.matury-online.pl",
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    react(),
    tailwind(),
    sitemap({
      filter: (page) =>
        !page.includes("/admin") &&
        !page.includes("/auth/") &&
        !page.includes("/dashboard") &&
        !page.includes("/polityka-prywatnosci") &&
        !page.includes("/privacy-policy") &&
        !page.includes("/regulamin") &&
        !page.includes("/terms-of-service"),
    }),
  ],
  vite: {
    ssr: { noExternal: ["nanostores", "@nanostores/react"] },
    server: {
      allowedHosts: ["dev.torweb.pl"],
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
  },
});
