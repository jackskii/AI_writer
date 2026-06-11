import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true,
    // Add your production domains here if needed
    // allowedHosts: ['your-domain.com']
  },
  build: {
    // Enable source maps for debugging (disable in production if needed)
    sourcemap: false,
    // Optimize build output - use esbuild instead of terser
    minify: 'esbuild',
    // Generate build report
    reportCompressedSize: true,
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000
  },
  define: {
    __DEV__: false,
  },
  // Environment variables prefix for security
  envPrefix: ['VITE_'],
  // Production optimizations
  esbuild: {
    // Remove console and debugger in production
    pure: ['console.log', 'console.warn', 'console.error', 'debugger']
  }
})
