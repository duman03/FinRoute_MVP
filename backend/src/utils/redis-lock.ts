import { redis } from '../config/redis';

const RELEASE_LOCK_LUA = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

export async function releaseRedisLockIfOwned(
  lockKey: string,
  lockValue: string
): Promise<number> {
  return await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, lockValue) as number;
}
