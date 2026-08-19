/**
 * Desktop-tuned rad/px values feel tiny on a phone because a swipe only
 * covers a few hundred CSS pixels. Boost on narrow viewports; leave wide
 * desktop windows unchanged.
 */
export const LOOK_SENSITIVITY_REF_WIDTH = 1440;

export function scaledLookSensitivity(base) {
  const width = window.visualViewport?.width || window.innerWidth || LOOK_SENSITIVITY_REF_WIDTH;
  return base * Math.max(1, LOOK_SENSITIVITY_REF_WIDTH / Math.max(320, width));
}
