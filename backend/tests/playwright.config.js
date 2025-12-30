import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'cd ../.. && cd frontend && python3 -m http.server 8080',
    port: 8080,
    timeout: 120000,
    reuseExistingServer: true,
  },
});
