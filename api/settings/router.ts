import { createRouter, publicQuery } from "../middleware";
import { UpdateSettingsInput } from "../../contracts/settings";
import * as store from "./store";

export const settingsRouter = createRouter({
  get: publicQuery.query(() => {
    return store.getSettings();
  }),

  update: publicQuery.input(UpdateSettingsInput).mutation(({ input }) => {
    return store.updateSettings(input);
  }),
});
