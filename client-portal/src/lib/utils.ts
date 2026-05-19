// Standard shadcn `cn()` helper — merges class strings with tailwind-merge
// so later utility classes win over earlier ones predictably.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
