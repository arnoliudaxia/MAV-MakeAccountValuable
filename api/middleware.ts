import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getSession } from "./auth";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;

export const protectedQuery = t.procedure.use(async ({ ctx, next }) => {
  const session = getSession(ctx.req);
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "请先登录或重新登录",
    });
  }

  return next({
    ctx: { ...ctx, session },
  });
});
