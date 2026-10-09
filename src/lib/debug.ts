import { getOcrDebugChoice } from './storage'

/**
 * Whether the on-device OCR diagnostics (debug panel, live crop preview,
 * "Save frame" capture) are available.
 *
 * The panel is a developer/field-diagnosis tool, so it defaults ON in dev
 * builds and OFF in production. A deployed build can still force it on with
 * `VITE_ENABLE_OCR_DEBUG=true` for real-phone testing.
 *
 * Users can override the default at runtime from Settings; that choice is
 * persisted per device and always wins over the build-time default.
 */
export const OCR_DEBUG_DEFAULT: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_OCR_DEBUG === 'true'

/**
 * Precedence rule: an explicit user choice beats the build-time default.
 * Pure so it can be unit-tested without touching `import.meta.env`.
 */
export function resolveOcrDebug(
  choice: boolean | null,
  fallback: boolean,
): boolean {
  return choice ?? fallback
}

/** Resolve the OCR debug flag from storage, falling back to the build default. */
export function isOcrDebugEnabled(): boolean {
  return resolveOcrDebug(getOcrDebugChoice(), OCR_DEBUG_DEFAULT)
}
