import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sapphire Clinics East — Patient Portal',
  description: 'Book your appointment online at Sapphire Clinics East',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold text-[color:var(--scei-teal)]">SCEI</span>
              <span className="text-sm text-slate-500 hidden sm:inline">Patient Portal</span>
            </a>
            <nav className="text-sm flex gap-4">
              <a href="/book" className="text-slate-700 hover:text-[color:var(--scei-teal)]">Book</a>
              <a href="/bookings" className="text-slate-700 hover:text-[color:var(--scei-teal)]">My Bookings</a>
            </nav>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
        <footer className="max-w-4xl mx-auto px-4 py-8 text-xs text-slate-400">
          © {new Date().getFullYear()} Sapphire Clinics East
        </footer>
      </body>
    </html>
  )
}
