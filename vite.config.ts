import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow connections from all network interfaces
    port: 9120, // Match the port with Docker
  },
  define: {
    // Define environment variables that will be available at build time
    'process.env.REACT_APP_API_URL': JSON.stringify(process.env.REACT_APP_API_URL || 'http://api-vsphere:8000'),
  }
})
