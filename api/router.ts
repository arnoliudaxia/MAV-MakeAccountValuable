import { createRouter, publicQuery } from "./middleware";
import { billRouter } from "./bills/router";
import { tagRouter } from "./tags/router";
import { databaseRouter } from "./database/router";
import { settingsRouter } from "./settings/router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  bill: billRouter,
  tag: tagRouter,
  database: databaseRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
