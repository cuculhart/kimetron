import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/kimetron/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: ['index.html', 'vanilla.html'],
    },
  },
})
