// The retention period comes from the Wrangler TTL_SECONDS variable.
export function calculateExpiration(receivedAt: number, ttlSeconds: number): number {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("TTL_SECONDS must be a positive integer in seconds");
  }

  const expiresAt = receivedAt + ttlSeconds * 1000;
  if (!Number.isSafeInteger(expiresAt)) {
    throw new Error("TTL_SECONDS results in an unsafe expiration timestamp");
  }

  return expiresAt;
}
