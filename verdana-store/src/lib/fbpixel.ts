// Meta (Facebook) Pixel helper. The pixel is loaded once in the root layout via
// <MetaPixel/>; these helpers fire standard ecommerce events for ad optimization.
// The ID can be overridden with NEXT_PUBLIC_FB_PIXEL_ID.

export const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '2145512076064651'

type FbqParams = Record<string, unknown>

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

/** Fire a standard Meta Pixel event (no-op if the pixel hasn't loaded yet). */
export function fbTrack(event: string, params?: FbqParams): void {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', event, params)
  }
}
