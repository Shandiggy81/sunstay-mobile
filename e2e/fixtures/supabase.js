// Fake, test-only Supabase settings for the smoke-test build. The `.invalid`
// host never resolves, and every request to it is intercepted by the specs,
// so no test can reach a real project. Process env overrides any local .env.
export const FAKE_SUPABASE_URL = 'https://sunstay-e2e.supabase.invalid';
export const FAKE_SUPABASE_ANON_KEY = 'e2e-fake-anon-key';
