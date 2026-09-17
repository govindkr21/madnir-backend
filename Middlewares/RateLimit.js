const buckets = new Map();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
cleanupInterval.unref?.();

const createRateLimit = ({ windowMs = 60_000, max = 300, keyGenerator } = {}) => (req, res, next) => {
  const key = keyGenerator ? keyGenerator(req) : `${req.ip}:${req.baseUrl}${req.path}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", max - 1);
    return next();
  }

  entry.count += 1;
  res.setHeader("X-RateLimit-Limit", max);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));

  if (entry.count > max) {
    res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ message: "Too many requests. Please slow down." });
  }
  return next();
};

const apiLimiter = createRateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 300),
});

const authLimiter = createRateLimit({
  windowMs: 15 * 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  keyGenerator: (req) => `auth:${req.ip}:${(req.body?.email || "").toLowerCase()}`,
});

module.exports = { createRateLimit, apiLimiter, authLimiter };
