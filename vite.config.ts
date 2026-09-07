import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { netlifyPlugin } from "@netlify/remix-adapter/plugin";

export default defineConfig({
  plugins: [
    tailwindcss(),
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    netlifyPlugin(),
  ],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./app"),
    },
  },
});
