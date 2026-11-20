import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedSamTrackingDuration, MAX_SAM_TRACKING_SECONDS, MIN_SAM_TRACKING_SECONDS } from "./samTrackingLimits";

test("accepts custom whole-second SAM tracking durations inside the safe upload range", () => {
  assert.equal(isSupportedSamTrackingDuration(MIN_SAM_TRACKING_SECONDS), true);
  assert.equal(isSupportedSamTrackingDuration(2), true);
  assert.equal(isSupportedSamTrackingDuration(MAX_SAM_TRACKING_SECONDS), true);
});

test("rejects fractional and out-of-range SAM tracking durations", () => {
  assert.equal(isSupportedSamTrackingDuration(0), false);
  assert.equal(isSupportedSamTrackingDuration(2.5), false);
  assert.equal(isSupportedSamTrackingDuration(MAX_SAM_TRACKING_SECONDS + 1), false);
});
