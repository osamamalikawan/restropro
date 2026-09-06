/**

* Stateless, HMAC-signed staff session.
* Uses the Web Crypto API for Node.js and Next.js Edge runtime.
  */

export interface StaffSessionPayload {
restaurantId: string;
employeeId: string;
role: "admin" | "manager" | "cashier" | "inventory";
sessionVersion: number;
issuedAt: number;
expiresAt: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function bytesToBase64Url(bytes: Uint8Array): string {
let binary = "";

for (const byte of bytes) {
binary += String.fromCharCode(byte);
}

const base64 = btoa(binary);

return base64
.replace(/\+/g, "-")
.replace(/\//g, "_")
.replace(/=+$/, "");
}

function base64UrlToBytes(value: string): ArrayBuffer {
const base64 = value
.replace(/-/g, "+")
.replace(/_/g, "/");

const padded =
base64 + "=".repeat((4 - (base64.length % 4)) % 4);

const binary = atob(padded);
const bytes = new Uint8Array(binary.length);

for (let i = 0; i < binary.length; i++) {
bytes[i] = binary.charCodeAt(i);
}

return bytes.buffer.slice(
bytes.byteOffset,
bytes.byteOffset + bytes.byteLength
);
}

async function getKey(): Promise<CryptoKey> {
const secret = process.env.STAFF_SESSION_SECRET;

if (!secret) {
throw new Error("STAFF_SESSION_SECRET is not set");
}

return crypto.subtle.importKey(
"raw",
new TextEncoder().encode(secret),
{
name: "HMAC",
hash: "SHA-256",
},
false,
["sign", "verify"]
);
}

export async function createStaffSessionToken(
payload: Omit<StaffSessionPayload, "issuedAt" | "expiresAt">
): Promise<string> {
const now = Date.now();

const full: StaffSessionPayload = {
...payload,
issuedAt: now,
expiresAt: now + SESSION_TTL_MS,
};

const payloadB64 = bytesToBase64Url(
new TextEncoder().encode(JSON.stringify(full))
);

const key = await getKey();

const signatureBuffer = await crypto.subtle.sign(
"HMAC",
key,
new TextEncoder().encode(payloadB64)
);

const signature = bytesToBase64Url(
new Uint8Array(signatureBuffer)
);

return `${payloadB64}.${signature}`;
}

export async function verifyStaffSessionToken(
token: string | undefined | null
): Promise<StaffSessionPayload | null> {
if (!token) {
return null;
}

const parts = token.split(".");

if (parts.length !== 2) {
return null;
}

const payloadB64 = parts[0];
const signature = parts[1];

if (!payloadB64 || !signature) {
return null;
}

try {
const key = await getKey();

const valid = await crypto.subtle.verify(
  "HMAC",
  key,
  base64UrlToBytes(signature),
  new TextEncoder().encode(payloadB64)
);

if (!valid) {
  return null;
}

const decodedPayload = new TextDecoder().decode(
  base64UrlToBytes(payloadB64)
);

const payload: StaffSessionPayload = JSON.parse(
  decodedPayload
);

if (
  typeof payload.restaurantId !== "string" ||
  typeof payload.employeeId !== "string" ||
  ![
    "admin",
    "manager",
    "cashier",
    "inventory",
  ].includes(payload.role) ||
  typeof payload.sessionVersion !== "number" ||
  typeof payload.issuedAt !== "number" ||
  typeof payload.expiresAt !== "number"
) {
  return null;
}

if (Date.now() > payload.expiresAt) {
  return null;
}

return payload;


} catch {
return null;
}
}

export const STAFF_SESSION_COOKIE = "rp_staff_session";
