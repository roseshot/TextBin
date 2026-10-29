// Worker-edge rate limiting prevents excess requests from reaching the shared Durable Object.
export interface RequestLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export async function checkRateLimit(request: Request, limiter: RequestLimiter): Promise<Response | null> {
  // Cloudflare sets this header at the edge. Local requests without an IP share a fallback bucket.
  const key = request.headers.get("cf-connecting-ip") || "unknown";
  const { success } = await limiter.limit({ key });
  if (success) return null;
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "retry-after": "60",
    },
  });
}
