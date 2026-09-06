/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/teddy-and-the-magic-theatre/',
  server: {
    port: 8080,
  },
  // Phaser's unbundled source guards optional features (WebGL debug via
  // SpectorJS, 3D plugins, etc.) behind `typeof FLAG` checks meant to be
  // dead-code-eliminated by a bundler define. Without these, `typeof
  // WEBGL_DEBUG` on an undeclared identifier still evaluates to the (truthy)
  // string "undefined", so Phaser unconditionally requires optional deps
  // like `phaser3spectorjs` that aren't installed.
  define: {
    'typeof CANVAS_RENDERER': JSON.stringify(true),
    'typeof WEBGL_RENDERER': JSON.stringify(true),
    'typeof WEBGL_DEBUG': JSON.stringify(false),
    'typeof EXPERIMENTAL': JSON.stringify(false),
    'typeof PLUGIN_3D': JSON.stringify(false),
    'typeof PLUGIN_CAMERA3D': JSON.stringify(false),
    'typeof PLUGIN_FBINSTANT': JSON.stringify(false),
    'typeof FEATURE_SOUND': JSON.stringify(true),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Force Phaser through Vite's transform pipeline (not Node's native
    // require) so the `define` flags above actually get substituted.
    server: {
      deps: {
        inline: ['phaser'],
      },
    },
  },
});
