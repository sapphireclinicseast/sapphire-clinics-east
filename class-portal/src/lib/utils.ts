// Tiny className concat helper. Mirrors shadcn's `cn` without requiring
// the clsx + tailwind-merge deps — sufficient for our handful of UI primitives.
export function cn(...inputs: Array<string | undefined | null | false>): string {
  return inputs.filter(Boolean).join(' ')
}
