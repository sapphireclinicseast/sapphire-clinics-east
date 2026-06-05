'use client'

import { createContext, useContext, useState, useEffect } from 'react'

export const BRANDS = [
  {
    id: 'sapphire-east',
    name: 'Sapphire Clinics East',
    shortName: 'SAPPHIRE',
    tagline: 'Your Health, Our Priority.',
    color: '#1A7B8A',
    lightBg: '#E4F3F5',
  },
  {
    id: 'sandbox-clinic',
    name: 'Sapphire Clinics East',
    shortName: 'SANDBOX',
    tagline: 'Choose Health. Choose Function. Choose Ability. Choose Sapphire Clinics East.',
    color: '#F47427',
    lightBg: '#FFF3EA',
  },
  {
    id: 'verdana-store',
    name: 'Verdana Store',
    shortName: 'VERDANA',
    tagline: 'Progress, Made Possible.',
    color: '#2D6A4F',
    lightBg: '#E8F5EE',
  },
] as const

export type Brand = (typeof BRANDS)[number]

interface BrandContextType {
  brand: Brand
  setBrand: (b: Brand) => void
  brands: typeof BRANDS
}

const BrandContext = createContext<BrandContextType>({
  brand: BRANDS[0],
  setBrand: () => {},
  brands: BRANDS,
})

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrandState] = useState<Brand>(BRANDS[0])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('selected-brand')
      if (saved) {
        const found = BRANDS.find((b) => b.id === saved)
        if (found) setBrandState(found)
      }
    } catch {}
  }, [])

  function setBrand(b: Brand) {
    setBrandState(b)
    try { localStorage.setItem('selected-brand', b.id) } catch {}
  }

  return (
    <BrandContext.Provider value={{ brand, setBrand, brands: BRANDS }}>
      {children}
    </BrandContext.Provider>
  )
}

export const useBrand = () => useContext(BrandContext)
