// Next.js instrumentation — runs once when the server starts.
// Used to boot the BullMQ post-publishing worker and recover any stuck posts.

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorker, recoverStuckPosts } = await import('./lib/queue')
    startWorker()
    // Delay slightly so Prisma/DB connection is ready
    setTimeout(() => recoverStuckPosts(), 3000)
  }
}
