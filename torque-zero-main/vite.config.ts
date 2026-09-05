import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  plugins: [
    {
      name: "remove-dialkit-remote-font",
      enforce: "pre",
      transform(code, id) {
        if (!id.includes("dialkit") || !id.endsWith(".css")) return
        return code.replace(/@import url\(['"]https:\/\/fonts\.googleapis\.com\/[^;]+;\s*/, "")
      },
    },
    react(),
    tailwindcss(),
  ],
  base: "./",
  server: {
    allowedHosts: ["dev.torque-zero.chainsman.com", "host.docker.internal"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
