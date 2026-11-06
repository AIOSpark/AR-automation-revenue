// AIOSpark Encryption & Secret Management Helper (AES-256-GCM)

import crypto from "crypto";

const DEVELOPMENT_ENCRYPTION_KEY = "aiospark-secret-encryption-key-32b!";
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): string {
  const configuredKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === "production" && !configuredKey) {
    throw new Error("Integration encryption is not configured");
  }
  return configuredKey || DEVELOPMENT_ENCRYPTION_KEY;
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptSecret(encryptedPayload: string): string {
  try {
    const parts = encryptedPayload.split(":");
    if (parts.length !== 3) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Unencrypted integration configuration is not allowed in production");
      }
      return encryptedPayload;
    }

    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Unable to decrypt integration configuration");
    }
    console.warn("Secret decryption fallback:", err);
    return encryptedPayload;
  }
}
