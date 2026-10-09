import type { ServiceLayout } from '../types'
import { getServiceLayoutChoice } from './storage'

/**
 * How the stop page lays out its services.
 *
 * The circular carousel is the shipped default; the plain list is an opt-in
 * alternative. A stored user choice always wins, mirroring `lib/debug.ts`.
 */
export const SERVICE_LAYOUT_DEFAULT: ServiceLayout = 'carousel'

/** Precedence rule: an explicit user choice beats the default. Pure. */
export function resolveServiceLayout(
  choice: ServiceLayout | null,
  fallback: ServiceLayout = SERVICE_LAYOUT_DEFAULT,
): ServiceLayout {
  return choice ?? fallback
}

/** Resolve the layout from storage, falling back to the default. */
export function getServiceLayout(): ServiceLayout {
  return resolveServiceLayout(getServiceLayoutChoice())
}
