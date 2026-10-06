import { createRouter, protectedQuery } from "../middleware";
import { UpdateSettingsInput } from "../../contracts/settings";
import * as store from "./store";
import { configureSync } from "../webdav/sync";

export const settingsRouter = createRouter({
  get: protectedQuery.query(() => {
    return store.getSettings();
  }),

  update: protectedQuery
    .input(UpdateSettingsInput)
    .mutation(async ({ input }) => {
      const settings = await store.updateSettings(input);
      if (input.webdav) await configureSync(settings.webdav);
      return settings;
    }),
});
