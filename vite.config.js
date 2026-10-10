import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/dictado/', // Asegúrate de que esto coincida con el nombre de tu repositorio de GitHub
})
