import { defineConfig } from 'vitest/config';
export default defineConfig({
  define: { SHADOW_MODE: JSON.stringify('open') },
  test: { environment: 'jsdom', globals: true, include: ['test/**/*.test.ts'],
    environmentOptions: { jsdom: { url: 'https://rjhs.instructure.com/' } } },
});
