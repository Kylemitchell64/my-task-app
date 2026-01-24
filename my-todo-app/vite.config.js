import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // https://vite.dev/config/build-options#build-sourcemap
    sourcemap: true,
    // will show you the source code that the bundled code maps to
    // slows down the build process
    // good for debugging
    // you don't turn it on for production builds typically (user experience perf degrades because you ship the source maps and extra metadata which makes it load the page more slowly)
  }
})

