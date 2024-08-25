import { createClient } from "redis";

// Create a Redis client instance
const redis = createClient({ url: process.env.REDIS_URL });
redis.connect().catch(console.error);

export default redis;
