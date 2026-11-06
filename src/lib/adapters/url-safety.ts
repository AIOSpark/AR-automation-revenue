import { promises as dns } from "node:dns";
import net from "node:net";

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_RESPONSE_BYTES = 5_000_000;

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "metadata",
]);

const BLOCKED_ADDRESSES = new Set([
  "169.254.169.254",
  "100.100.100.200",
  "fd00:ec2::254",
]);

function devAllowsPrivateHosts(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NODE_ENV === "development" ||
      process.env.AIOSPARK_TEST_MODE === "true" ||
      process.env.AIOSPARK_DEV_AUTH === "true")
  );
}

function allowedHosts(): Set<string> {
  return new Set(
    (process.env.AIOSPARK_INTEGRATION_ALLOWED_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean)
  );
}

function ipv4ToInt(address: string): number | null {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true;

  const ranges: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
    ["255.255.255.255", 32],
  ];

  return ranges.some(([prefix, bits]) => {
    const prefixValue = ipv4ToInt(prefix);
    if (prefixValue === null) return true;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (prefixValue & mask);
  });
}

function expandIpv6(address: string): number[] | null {
  let value = address.toLowerCase();
  const zoneIndex = value.indexOf("%");
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);

  const ipv4Match = value.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    const parts = ipv4Match[1].split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return null;
    }
    const high = ((parts[0] << 8) | parts[1]).toString(16);
    const low = ((parts[2] << 8) | parts[3]).toString(16);
    value = `${value.slice(0, -ipv4Match[1].length)}${high}:${low}`;
  }

  const [head, tail] = value.split("::");
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail !== undefined && tail ? tail.split(":").filter(Boolean) : [];
  const groups = [...headParts, ...tailParts];
  if (groups.length > 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;

  const headNumbers = headParts.map((part) => parseInt(part, 16));
  const tailNumbers = tailParts.map((part) => parseInt(part, 16));
  const fill = 8 - headNumbers.length - tailNumbers.length;
  if (fill < 0 || (tail === undefined && fill !== 0)) return null;

  return [...headNumbers, ...Array(fill).fill(0), ...tailNumbers];
}

function embeddedIpv4(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function isPrivateOrReservedAddress(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (!net.isIPv6(address)) return true;

  const groups = expandIpv6(address);
  if (!groups) return true;

  const firstFiveZero = groups.slice(0, 5).every((group) => group === 0);

  if (groups.every((group) => group === 0)) return true;
  if (firstFiveZero && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) return true;
  if (firstFiveZero && groups[5] === 0xffff) {
    return isPrivateIpv4(embeddedIpv4(groups[6], groups[7]));
  }
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    return isPrivateIpv4(embeddedIpv4(groups[6], groups[7]));
  }
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x2002) return true;

  return false;
}

export type EndpointValidation = { ok: true; url: string } | { ok: false; error: string };

export async function validateIntegrationEndpoint(rawUrl: string): Promise<EndpointValidation> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, error: "endpoint URL is empty" };
  if (trimmed.length > MAX_ENDPOINT_LENGTH) return { ok: false, error: "endpoint URL is too long" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "endpoint URL is invalid" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "only http and https endpoints are allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "endpoint URLs must not contain credentials" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname) return { ok: false, error: "endpoint hostname is missing" };
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, error: "endpoint hostname is not allowed" };
  }

  const hostAllowlisted = allowedHosts().has(hostname);
  let addresses: string[];

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    addresses = ["127.0.0.1"];
  } else if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
      addresses = resolved.map((entry) => entry.address);
    } catch {
      return { ok: false, error: "endpoint hostname could not be resolved" };
    }
  }

  if (addresses.length === 0) return { ok: false, error: "endpoint hostname has no addresses" };
  if (addresses.some((address) => BLOCKED_ADDRESSES.has(address.toLowerCase()))) {
    return { ok: false, error: "endpoint resolves to a blocked cloud metadata address" };
  }
  if (!hostAllowlisted && !devAllowsPrivateHosts() && addresses.some(isPrivateOrReservedAddress)) {
    return {
      ok: false,
      error: "endpoint host is private or reserved; add it to AIOSPARK_INTEGRATION_ALLOWED_HOSTS to permit an on-prem connector",
    };
  }

  return { ok: true, url: parsed.toString() };
}

export async function readResponseTextCapped(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`response exceeded the ${maxBytes} byte limit`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`response exceeded the ${maxBytes} byte limit`);
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}
