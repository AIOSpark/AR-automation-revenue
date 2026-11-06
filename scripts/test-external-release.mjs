/**
 * Fail-closed staging gate for real deployment/integration validation.
 *
 * This script deliberately does not fall back to fixtures or sandbox logging.
 * It must only be run against a dedicated staging tenant and test mailbox.
 */

const required = [
  'AIOSPARK_DEPLOYMENT_URL',
  'ZOHO_ACCESS_TOKEN',
  'ZOHO_BOOKS_ORGANIZATION_ID',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'AIOSPARK_EXTERNAL_TEST_EMAIL',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error('External release gate is BLOCKED. Missing configuration:');
  for (const name of missing) console.error(`- ${name}`);
  process.exit(2);
}

if (process.env.AIOSPARK_ALLOW_EXTERNAL_EMAIL_TEST !== 'true') {
  console.error('External release gate is BLOCKED.');
  console.error('Set AIOSPARK_ALLOW_EXTERNAL_EMAIL_TEST=true only for a dedicated staging test mailbox.');
  process.exit(2);
}

const baseUrl = process.env.AIOSPARK_DEPLOYMENT_URL.replace(/\/$/, '');
const healthResponse = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10_000) });
if (!healthResponse.ok) {
  throw new Error(`Deployment health check failed with HTTP ${healthResponse.status}`);
}

const health = await healthResponse.json();
if (health.status !== 'ok' || health.persistence?.driver !== 'sqlite') {
  throw new Error('Deployment health response did not report a healthy SQLite-backed service');
}

const zohoDomain = (process.env.ZOHO_BOOKS_API_DOMAIN || 'https://www.zohoapis.com').replace(/\/$/, '');
const erpResponse = await fetch(
  `${zohoDomain}/books/v3/organizations?organization_id=${encodeURIComponent(process.env.ZOHO_BOOKS_ORGANIZATION_ID)}`,
  {
    headers: { Authorization: `Zoho-oauthtoken ${process.env.ZOHO_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  },
);
if (!erpResponse.ok) {
  throw new Error(`Zoho Books connectivity check failed with HTTP ${erpResponse.status}`);
}
const erpPayload = await erpResponse.json();
if (erpPayload.code !== 0 && erpPayload.code !== undefined) {
  throw new Error(`Zoho Books returned provider code ${erpPayload.code}`);
}

const emailResponse = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: process.env.EMAIL_FROM,
    to: [process.env.AIOSPARK_EXTERNAL_TEST_EMAIL],
    subject: '[AIOSpark staging] external release gate',
    text: 'AIOSpark external release gate verification message. No customer data is included.',
  }),
  signal: AbortSignal.timeout(10_000),
});
if (!emailResponse.ok) {
  const detail = await emailResponse.text();
  throw new Error(`Resend email delivery check failed with HTTP ${emailResponse.status}: ${detail}`);
}

console.log('Deployment health check: PASS');
console.log('Zoho Books connectivity check: PASS');
console.log('Resend email delivery check: PASS');
