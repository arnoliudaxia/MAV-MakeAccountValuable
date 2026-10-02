import { createRouter, protectedQuery } from "../middleware";
import { UpdateSettingsInput } from "../../contracts/settings";
import * as store from "./store";

export const settingsRouter = createRouter({
  get: protectedQuery.query(() => {
    return store.getSettings();
  }),

  update: protectedQuery.input(UpdateSettingsInput).mutation(({ input }) => {
    return store.updateSettings(input);
  }),
});
