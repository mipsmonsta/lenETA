/**
 * Pure geometry for the circular service carousel.
 *
 * The track renders N + 2 cards: a clone of the last service at position 0,
 * the N real services at positions 1..N, and a clone of the first at N + 1.
 * The track is padded by `(container - card) / 2` so that the scroll offset
 * `position * stride` centres that card — which keeps position and scroll
 * offset linearly related and the index math trivial.
 *
 * Wrapping past the seam is done by silently jumping from a clone to the real
 * card that renders identical content at an identical offset (see
 * `wrapTargetPosition`), because CSS scroll-snap cannot wrap on its own.
 */

/** Scroll offset -> the nearest virtual position, clamped to the track. */
export function pagerPositionFromScroll(
  scrollLeft: number,
  stride: number,
  count: number,
): number {
  if (stride <= 0 || count <= 0) return 0
  const raw = Math.round(scrollLeft / stride)
  return Math.min(count - 1, Math.max(0, raw))
}

export function scrollLeftForPosition(position: number, stride: number): number {
  return position * stride
}

/** Virtual position (0..n+1) -> the real service index (0..n-1). */
export function realIndexFromPosition(position: number, n: number): number {
  if (n <= 0) return 0
  return (((position - 1) % n) + n) % n
}

/** Real service index -> the virtual position holding its real (uncloned) card. */
export function positionFromRealIndex(realIndex: number): number {
  return realIndex + 1
}

/**
 * Where to silently jump when the track settles on a cloned card, or null when
 * it settled on a real one or there is nothing to wrap to.
 */
export function wrapTargetPosition(position: number, n: number): number | null {
  if (n <= 1) return null
  if (position <= 0) return n
  if (position >= n + 1) return 1
  return null
}

/**
 * Signed distance from `b` to `a` the short way around a ring of `n` items,
 * within [-n/2, n/2]. `a` is an integer card index; `b` may be fractional so
 * the taper can follow a drag continuously.
 */
export function shortestCircularDelta(a: number, b: number, n: number): number {
  if (n <= 0) return 0
  let d = (a - b) % n
  if (d > n / 2) d -= n
  if (d < -n / 2) d += n
  return d
}

/** Index of the service with this number, or 0 when it is gone/unknown. */
export function indexOfServiceNo(
  services: ReadonlyArray<{ no: string }>,
  no: string | null,
): number {
  if (!no) return 0
  const i = services.findIndex((s) => s.no === no)
  return i < 0 ? 0 : i
}
