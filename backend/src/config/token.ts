// v4.7: Single source of truth for all TTL values
// EC-19: login TTL = refresh TTL = middleware TTL = this object
export const TOKEN_CONFIG = {
  accessTTL: 15 * 60,        // 900 seconds
  refreshTTL: 7 * 24 * 3600,  // 604800 seconds (7 days)
} as const;
