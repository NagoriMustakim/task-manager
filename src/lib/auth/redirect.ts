/**
 * Returns a same-origin, relative path that is safe to redirect to after authentication.
 * Anything else (absolute URLs, protocol-relative `//host`, backslashes, control chars,
 * auth pages themselves) falls back to `fallback`.
 */
export function safeRedirectPath(input: unknown, fallback = "/"): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) return fallback;
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(input)) return fallback;
  let decoded = input;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
  // Resolve against a dummy origin to be sure it stays same-origin.
  try {
    const url = new URL(input, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    if (/^\/(login|signup|forgot-password|auth)(\/|$)/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
