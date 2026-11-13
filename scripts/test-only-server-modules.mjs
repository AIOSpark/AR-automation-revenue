// Test-only module resolution hook.
//
// `server-only` throws when imported outside a React Server Components
// environment. Test runners (tsx under plain Node) are exactly such an
// environment, so any server module marked with `import 'server-only'` would
// fail at load time — even though the module is only being exercised as plain
// server-side code.
//
// This hook is loaded with `node --import` by the test scripts only. It
// redirects the `server-only` marker to an empty module, mirroring the
// "react-server" export condition that Next.js uses in server builds.
// Production code keeps the real import, so Next.js still rejects client
// components that pull in server-only modules.
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const stubUrl = pathToFileURL(
  path.join(import.meta.dirname, 'test-server-only-stub.mjs')
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: stubUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
