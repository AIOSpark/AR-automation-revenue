// Test-only stand-in for the `server-only` marker package.
//
// In a real Next.js server build, `server-only` is an empty module (its
// "react-server" export condition). Outside Next.js — e.g. under tsx — the
// default export throws by design. Tests run outside Next.js, so the loader in
// `test-only-server-modules.mjs` resolves the marker to this empty module.
//
// This file is only ever reachable through a test process. Production builds
// still resolve the real package, preserving Next.js's build-time enforcement.
export {};
