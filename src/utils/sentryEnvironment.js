/**
 * Sentry environment and release from the Netlify build. Netlify sets CONTEXT
 * (production, deploy-preview, branch-deploy, dev) and COMMIT_REF while it
 * builds; vite.config.js passes them in as build-time constants. Without
 * this every build reported as "production", so test runs on deploy
 * previews showed up as production errors.
 */
const NETLIFY_CONTEXTS = new Set(['production', 'deploy-preview', 'branch-deploy']);

export function sentryEnvironment(netlifyContext, viteMode) {
    const context = String(netlifyContext ?? '').trim();
    if (NETLIFY_CONTEXTS.has(context)) return context;
    return String(viteMode ?? '').trim() || 'development';
}

/** "sunstay@<first 12 of the commit>", or undefined outside a Netlify build. */
export function sentryRelease(commitRef) {
    const ref = String(commitRef ?? '').trim();
    return /^[0-9a-f]{7,40}$/i.test(ref) ? `sunstay@${ref.slice(0, 12).toLowerCase()}` : undefined;
}
