'use client'

import { Suspense, lazy } from 'react'

// Dynamic-import the Spline runtime: it pulls in ~700kb of WebGL deps that
// we don't want on the initial paint critical path.
const Spline = lazy(() => import('@splinetool/react-spline'))

interface SplineSceneProps {
  /**
   * Public Spline `.splinecode` URL.
   *
   * To swap to an anatomy / human-body scene:
   *   1. Open Spline (https://app.spline.design/) and pick (or build) a
   *      human-anatomy scene from the Community library.
   *   2. Click "Export" → "Code (React)" → copy the scene URL ending in
   *      `/scene.splinecode`.
   *   3. Pass that URL here, or set NEXT_PUBLIC_SPLINE_HERO_SCENE in env.
   */
  scene: string
  className?: string
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div className={className} aria-hidden>
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
          </div>
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  )
}
