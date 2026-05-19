'use client'

import { cn } from '@/lib/utils'
import React, { ReactNode } from 'react'

// Aurora background — adapted from Aceternity (21st.dev / aurora-background)
// Color palette tuned to the SCEI brand: layered greens with a touch of
// warmth, instead of the original blue/violet aurora.

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode
  showRadialGradient?: boolean
}

export function AuroraBackground({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col h-[100vh] items-center justify-center text-[color:var(--narra)] transition-bg',
        'bg-[color:var(--paper)]',
        className,
      )}
      style={{ ['--transparent' as string]: 'transparent' }}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={cn(
            // Two layered gradients: a soft "paper" highlight + the green aurora.
            '[--paper-gradient:repeating-linear-gradient(100deg,var(--paper)_0%,var(--paper)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--paper)_16%)]',
            '[--aurora:repeating-linear-gradient(100deg,var(--narra)_10%,var(--moss)_15%,var(--sage)_20%,var(--scei-mint)_25%,var(--moss)_30%)]',
            '[background-image:var(--paper-gradient),var(--aurora)]',
            '[background-size:300%,_200%]',
            '[background-position:50%_50%,50%_50%]',
            'filter blur-[10px]',
            'after:content-[""] after:absolute after:inset-0 after:[background-image:var(--paper-gradient),var(--aurora)]',
            'after:[background-size:200%,_100%]',
            'after:animate-aurora after:[background-attachment:fixed] after:mix-blend-difference',
            'pointer-events-none',
            'absolute -inset-[10px] opacity-50 will-change-transform',
            showRadialGradient && '[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]',
          )}
        />
      </div>
      {children}
    </div>
  )
}
