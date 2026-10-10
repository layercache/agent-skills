import { buildDigests, type Env } from "./digest";

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(buildDigests(env));
  },
};
