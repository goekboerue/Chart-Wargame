import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // By default, Vite only exposes env vars prefixed with VITE_.
      // This line forces the expansion of process.env.API_KEY with the actual value from Vercel/System.
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});