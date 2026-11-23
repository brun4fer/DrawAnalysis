export const SETTINGS_PROJECT_PREFIX = "__TACTIDRAW_SETTINGS__:";

/** Settings share the database but not the product's favourite tools. */
export function userSettingsProjectName(userId: string, productVariant?: string) {
  return `${SETTINGS_PROJECT_PREFIX}${userId}${productVariant ? `:${productVariant}` : ""}`;
}
