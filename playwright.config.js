import { defineConfig } from '@playwright/test';
import { FAKE_SUPABASE_ANON_KEY, FAKE_SUPABASE_URL } from './e2e/fixtures/supabase.js';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    timezoneId: 'Australia/Melbourne',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    // Its own build in dist-e2e with a fake Supabase client, so venue sun
    // horizons can be mocked; the production dist build is left alone.
    command: 'npx vite build --outDir dist-e2e --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort',
    env: { VITE_SUPABASE_URL: FAKE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: FAKE_SUPABASE_ANON_KEY },
    timeout: 180_000,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
