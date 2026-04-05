import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
  },
});

redis.on("error", (err) => {
  console.error("Redis client error:", err.message);
});

redis.connect().catch(console.error);

export default redis;
