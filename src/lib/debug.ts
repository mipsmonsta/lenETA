/**
 * Whether the on-device OCR diagnostics (debug panel, binarized preview,
 * "Save frame" capture) should be shown. Enabled in dev builds, and also when
 * the `VITE_ENABLE_OCR_DEBUG` env flag is set (so the diagnostic panel can be
 * shipped once to a deployed HTTPS URL for real-phone testing).
 */
export const ENABLE_OCR_DEBUG: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_OCR_DEBUG === 'true'
