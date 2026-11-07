import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // TanStack prerenders through Vite preview. Pin the same loopback family in
  // containers so the listener and Node fetch cannot disagree on localhost.
  preview: { host: "127.0.0.1" },
  plugins: [
    tanstackStart({
      spa: { enabled: true },
    }),
    tailwindcss(),
    tsconfigPaths(),
    viteReact(),
  ],
});
