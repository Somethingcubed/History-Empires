import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  publicDir: false,
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "data/**/*", dest: "data" },
        { src: "css/**/*", dest: "css" },
        { src: "battle-sim.cdn.html", dest: "." },
        { src: "js/battle-sim.js", dest: "js" },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: resolve(__dirname, "battle-sim.html"),
    },
  },
});
