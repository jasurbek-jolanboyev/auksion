import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(appDir,'../..');

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  envDir: projectRoot,
  build: { outDir: path.join(appDir,'dist'), emptyOutDir: true, rollupOptions: { input: { site: path.join(projectRoot,'index.html'), admin: path.join(projectRoot,'admin.html') } } },
  server: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://localhost:4100' },
    allowedHosts: ['.localhost']
  }
});
