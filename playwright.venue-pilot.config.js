import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
import { FAKE_SUPABASE_URL, FAKE_SUPABASE_ANON_KEY } from './e2e/fixtures/supabase.js';

export default defineConfig({
  ...base,
  testDir: './e2e/venue-pilot',
  timeout: 120_000,
  outputDir: 'test-results/venue-pilot',
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174', trace: 'off', actionTimeout: 15_000 },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4174 --strictPort',
    env: { VITE_SUPABASE_URL: FAKE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: FAKE_SUPABASE_ANON_KEY },
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
