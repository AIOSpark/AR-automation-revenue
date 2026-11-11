// AIOSpark Secret & Dependency Security Scanner (Layer 36/CI)
import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATTERNS = [
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, // JWT pattern
  /sbp_[a-f0-9]{40}/, // Supabase service role key pattern
  /sk-proj-[a-zA-Z0-9_-]{40,}/, // OpenAI secret key pattern
  /xprv[a-zA-Z0-9]{100,}/, // Master private key pattern
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

function scanDirectory(dirPath) {
  let issuesFound = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'build') {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      issuesFound += scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.json') || entry.name.endsWith('.env'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          console.error(`🚨 [SECRET DETECTED] File ${fullPath} contains potential hardcoded secret!`);
          issuesFound++;
        }
      }
    }
  }
  return issuesFound;
}

// ---------------------------------------------------------------------------
// Server-only boundary check
//
// `server-only` is a build-time marker: Next.js rejects any client component
// whose import graph reaches a module that imports it. A local stand-in module
// or an empty shim silently disables that protection, so this scan walks the
// import graph from every `"use client"` entry point and fails if it reaches a
// server-only module (or a local server-only shim).
// ---------------------------------------------------------------------------

function collectSourceFiles(dirPath, files = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasUseClientDirective(content) {
  const withoutBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rawLine of withoutBlockComments.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    return /^(['"])use client\1;?$/.test(line);
  }
  return false;
}

function isTypeOnlyNamedImports(clause) {
  const trimmed = clause.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
  const specifiers = trimmed
    .slice(1, -1)
    .split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean);
  return specifiers.every((specifier) => /^type\s+/.test(specifier));
}

function extractImportSpecifiers(content) {
  const specifiers = new Set();

  // Static imports and re-exports. Type-only imports are erased at compile
  // time and therefore cannot pull runtime code into a client bundle, so they
  // are not part of the runtime import graph.
  const statementPattern = /\b(import|export)\s+(type\s+)?([^'"]*?)\s*(?:from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = statementPattern.exec(content)) !== null) {
    const [, keyword, typeKeyword, clause, specifier] = match;
    if (typeKeyword) continue;
    if (keyword === 'import' && isTypeOnlyNamedImports(clause)) continue;
    specifiers.add(specifier);
  }

  for (const dynamicPattern of [
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    let dynamicMatch;
    while ((dynamicMatch = dynamicPattern.exec(content)) !== null) {
      specifiers.add(dynamicMatch[1]);
    }
  }

  return [...specifiers];
}

function resolveLocalImport(specifier, fromFile, rootDir) {
  let base;
  if (specifier.startsWith('@/')) {
    base = path.join(rootDir, 'src', specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const candidates = [base, ...SOURCE_EXTENSIONS.map((ext) => base + ext)];
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.push(path.join(base, `index${ext}`));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function isServerOnlyModule(content) {
  // Any import of the real marker, or of a project-local shim that stands in
  // for it (e.g. `import './server-only'`), makes a module server-only.
  return /(?:^|\n)\s*import\s+(?:type\s+)?['"](?:server-only|\.{1,2}\/[^'"]*server-only(?:\.(?:ts|tsx|js|mjs))?)['"]/.test(
    content
  );
}

function checkServerOnlyBoundaries(rootDir) {
  const srcDir = path.join(rootDir, 'src');
  const files = collectSourceFiles(srcDir);
  const cache = new Map();

  function loadFile(filePath) {
    if (!cache.has(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      cache.set(filePath, {
        content,
        isClientEntry: hasUseClientDirective(content),
        isServerOnly: isServerOnlyModule(content),
        imports: extractImportSpecifiers(content),
      });
    }
    return cache.get(filePath);
  }

  const violations = [];

  for (const filePath of files) {
    const file = loadFile(filePath);
    if (!file.isClientEntry) continue;

    const visited = new Set();
    const queue = [{ filePath, chain: [filePath] }];

    while (queue.length > 0) {
      const { filePath: current, chain } = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      const currentFile = loadFile(current);
      if (currentFile.isServerOnly) {
        violations.push({ clientEntry: filePath, chain });
        continue;
      }

      for (const specifier of currentFile.imports) {
        const resolved = resolveLocalImport(specifier, current, rootDir);
        if (resolved) {
          queue.push({ filePath: resolved, chain: [...chain, resolved] });
        }
      }
    }
  }

  return violations;
}

console.log('🔍 Running AIOSpark Secret Scanning...');
const rootDir = process.cwd();
const secretIssues = scanDirectory(path.join(rootDir, 'src'));

console.log('🔍 Checking server-only import boundaries...');
const boundaryViolations = checkServerOnlyBoundaries(rootDir);
for (const violation of boundaryViolations) {
  const chain = violation.chain
    .map((filePath) => path.relative(rootDir, filePath))
    .join(' -> ');
  console.error(
    `🚨 [SERVER-ONLY LEAK] Client component ${path.relative(rootDir, violation.clientEntry)} imports a server-only module: ${chain}`
  );
}

if (secretIssues > 0 || boundaryViolations.length > 0) {
  if (secretIssues > 0) {
    console.error(`❌ Secret Scanning failed: ${secretIssues} hardcoded secrets detected.`);
  }
  if (boundaryViolations.length > 0) {
    console.error(
      `❌ Server-only boundary check failed: ${boundaryViolations.length} client import graph(s) reach a server-only module.`
    );
  }
  process.exit(1);
}

console.log('✅ Secret Scanning clean: Zero hardcoded secrets found in codebase.');
console.log('✅ Server-only boundary check clean: No client import graph reaches a server-only module.');
process.exit(0);
