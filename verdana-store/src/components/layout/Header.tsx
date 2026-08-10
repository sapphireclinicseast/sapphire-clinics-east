"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Search, User, ShoppingBag, Menu, X } from "lucide-react"
import { useCart } from "@/hooks/use-cart"
import { CartDrawer } from "./CartDrawer"

export function Header() {
  const { totalItems, setIsCartOpen } = useCart()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/collections", label: "Shop" },
    { href: "/about", label: "About Us" },
  ]

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2 -ml-2 text-verdana-charcoal hover:text-verdana-teal"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/api/uploads/logo/verdana-mark.png"
              alt="Verdana Rehab Solutions"
              width={44}
              height={36}
              unoptimized
              className="h-9 w-auto"
              priority
            />
            <span className="flex flex-col leading-none">
              <span className="font-display font-bold text-lg text-verdana-charcoal tracking-tight">
                Verdana
                <sup className="ml-0.5 text-[0.6em] font-semibold align-super">®</sup>
              </span>
              <span className="mt-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-verdana-teal">
                Rehab Solutions
              </span>
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-verdana-charcoal hover:text-verdana-teal transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            <Link
              href="/search"
              className="p-2 text-verdana-charcoal hover:text-verdana-teal transition-colors"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </Link>

            <Link
              href="/account"
              className="p-2 text-verdana-charcoal hover:text-verdana-teal transition-colors hidden sm:inline-flex"
              aria-label="Account"
            >
              <User className="h-5 w-5" />
            </Link>

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-verdana-charcoal hover:text-verdana-teal transition-colors"
              aria-label="Cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-verdana-orange text-[10px] font-bold text-white">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white">
            <nav className="flex flex-col px-4 py-4 space-y-3">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-base font-medium text-verdana-charcoal hover:text-verdana-teal transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      <CartDrawer />
    </>
  )
}
