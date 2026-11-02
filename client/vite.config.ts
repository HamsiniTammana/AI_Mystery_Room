import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["ai-mystery-room12.onrender.com", ".onrender.com"],
    proxy: { "/api": "http://localhost:4000" },
  },
});
