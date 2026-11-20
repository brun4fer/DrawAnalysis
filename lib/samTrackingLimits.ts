/**
 * A clip is sent through a Vercel function and the Meta Files API. Keeping the
 * interval bounded protects the 4 MB upload budget while still allowing a
 * meaningful custom tracking interval.
 */
export const MIN_SAM_TRACKING_SECONDS = 1;
export const MAX_SAM_TRACKING_SECONDS = 8;

export function isSupportedSamTrackingDuration(value: number) {
  return Number.isInteger(value)
    && value >= MIN_SAM_TRACKING_SECONDS
    && value <= MAX_SAM_TRACKING_SECONDS;
}
