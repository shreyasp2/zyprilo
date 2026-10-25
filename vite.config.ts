import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// BASE_PATH lets GitHub Pages project sites build with the right asset base
// (e.g. BASE_PATH=/my-repo/ npm run build). Defaults to '/', which is correct
// for a custom domain or a <user>.github.io repository.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
})
