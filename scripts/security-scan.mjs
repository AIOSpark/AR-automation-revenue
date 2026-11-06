// AIOSpark Secret & Dependency Security Scanner (Layer 36/CI)
import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATTERNS = [
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, // JWT pattern
  /sbp_[a-f0-9]{40}/, // Supabase service role key pattern
  /sk-proj-[a-zA-Z0-9_-]{40,}/, // OpenAI secret key pattern
  /xprv[a-zA-Z0-9]{100,}/, // Master private key pattern
];

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

console.log('🔍 Running AIOSpark Secret Scanning...');
const rootDir = process.cwd();
const secretIssues = scanDirectory(path.join(rootDir, 'src'));

if (secretIssues > 0) {
  console.error(`❌ Secret Scanning failed: ${secretIssues} hardcoded secrets detected.`);
  process.exit(1);
} else {
  console.log('✅ Secret Scanning clean: Zero hardcoded secrets found in codebase.');
  process.exit(0);
}
