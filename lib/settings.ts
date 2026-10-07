export const SETTINGS_PROJECT_PREFIX = "__TACTIDRAW_SETTINGS__:";

export function userSettingsProjectName(userId: string) {
  return `${SETTINGS_PROJECT_PREFIX}${userId}`;
}
