/// <reference types="vitest/config" />
import { defineConfig, type IndexHtmlTransformContext, type IndexHtmlTransformResult, type ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { join, resolve } from 'path'
import react from '@vitejs/plugin-react'
import { examplesManifestPlugin } from './vite.examplesManifestPlugin'

// Copies the minimal pyodide runtime files needed for in-browser execution
// into public/pyodide/ so they're served from the app's own origin (not CDN).
// This lets blob workers call importScripts against the app host instead of an
// external domain, which is required in Cribl's sandboxed iframe environment.
const PYODIDE_FILES = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']

const pyodideStaticPlugin = () => ({
  name: 'pyodide-static',
  async buildStart() {
    const src = resolve('node_modules/pyodide')
    const dest = resolve('public/pyodide')
    await mkdir(dest, { recursive: true })
    await Promise.all(PYODIDE_FILES.map((f) => cp(join(src, f), join(dest, f))))
  },
})
// @ts-expect-error — .mjs module lacks type declarations
import { servePackageTgz } from './scripts/pkgutil.mjs'

const packageEndpointPlugin = () => ({
  name: 'vite-plugin-package-endpoint',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/package.tgz', (req: IncomingMessage, res: ServerResponse) => {
      void servePackageTgz(req, res, server.config.root)
    })
  },
})

const injectScriptFromQueryPlugin = () => {
  let initScriptUrl: string | null = null;
  return {
    name: 'inject-script-from-query',
    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      server.watcher.add([
        join(root, 'package.json'),
        join(root, 'config', 'proxies.yml'),
      ]);
      server.watcher.on('change', (file) => {
        if (file === join(root, 'package.json') || file === join(root, 'config', 'proxies.yml')) {
          server.ws.send({ type: 'full-reload' });
        }
      });
    },
    transformIndexHtml(html: string, ctx: IndexHtmlTransformContext): IndexHtmlTransformResult{
      const url = new URL(ctx.originalUrl ?? '/', 'https://localhost');
      initScriptUrl = initScriptUrl || url.searchParams.get('init');
      const root = process.cwd();
      let appName;
      try {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { name?: string };
        appName = pkg.name;
      } catch {
        /* ignore missing or invalid package.json */
      }
      appName = appName || 'unknown';
      const tags: Array<{ tag: string; attrs?: Record<string, string>; children?: string; injectTo: 'head-prepend' }> = [];
      tags.push({
        tag: 'script',
        children: `window.CRIBL_APP_ID = '__dev__${appName}';`,
        injectTo: 'head-prepend' as const,
      });
      if (initScriptUrl) {
        tags.push({
          tag: 'script',
          attrs: { src: initScriptUrl, type: 'text/javascript' },
          injectTo: 'head-prepend' as const,
        });
      }
      return { html, tags };
    },
  };
};

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    react(),
    packageEndpointPlugin(),
    injectScriptFromQueryPlugin(),
    pyodideStaticPlugin(),
    examplesManifestPlugin(),
  ],
  base: './',
  server: {
    cors: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/testing/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})

