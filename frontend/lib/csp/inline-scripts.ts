/**
 * The only hand-written inline <script>s the app renders. They run before
 * hydration (no flash of the wrong theme), so they cannot carry a per-request
 * nonce on static pages. The strict CSP (lib/csp/policy.ts) allows them by
 * SHA-256 hash instead.
 *
 * Edit a script → update its hash (tests/csp-policy.test.ts recomputes both
 * and fails on a mismatch):
 *   node -e "console.log(require('crypto').createHash('sha256').update(SCRIPT).digest('base64'))"
 */

/** app/layout.tsx: theme class (+ color-scheme) on <html>; same key and dark default as next-themes. */
export const THEME_INIT_SCRIPT =
  "(function(){var t='dark';try{t=localStorage.getItem('theme')||'dark'}catch(e){}if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var d=document.documentElement;d.classList.add(t);if(t==='light'||t==='dark'){d.style.colorScheme=t}})();"

/** app/global-error.tsx: the error page replaces the root layout, so it sets its own theme class. */
export const GLOBAL_ERROR_THEME_SCRIPT =
  "(function(){try{var t=localStorage.getItem('theme')||'dark';if(t==='light'||t==='dark'){document.body.classList.add('ge-'+t)}}catch(e){}})();"

export const INLINE_SCRIPT_HASHES: readonly string[] = [
  "'sha256-CHINYoDEMKGOK7HaP2zBaTSHgufBUMgiLxcgpvywlbY='",
  "'sha256-4kXcqaEQK04P18sgXf6t4d6E6m5PdOzIx7PyAIGhBg0='",
]
