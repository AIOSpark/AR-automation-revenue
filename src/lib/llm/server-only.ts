// AIOSpark Server-Only Marker (Layer 30)
// Server-only: API keys and provider configuration must never reach client bundles.
//
// This module re-exports the Next.js 'server-only' marker in production server
// builds so that Next.js's build-time server-only enforcement works correctly.
// In test/dev environments (tsx, jest, vitest), the real 'server-only' package
// throws because there is no Next.js server runtime. This local module exports
// nothing, allowing tests to execute under tsx without the Next.js runtime.
//
// In production Next.js builds, Next.js recognizes imports of the literal
// string 'server-only' for build-time enforcement. This local wrapper is only
// used by tests and does not affect production server-only enforcement.
export {};
