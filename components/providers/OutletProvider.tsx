'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface Outlet {
  id: string
  name: string
  code: string
}

interface OutletContextValue {
  outlets: Outlet[]
  selectedOutlet: Outlet | null
  setSelectedOutlet: (outlet: Outlet) => void
  isLoading: boolean
}

const OutletContext = createContext<OutletContextValue>({
  outlets: [],
  selectedOutlet: null,
  setSelectedOutlet: () => {},
  isLoading: true,
})

export function OutletProvider({ children }: { children: React.ReactNode }) {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [selectedOutlet, setSelectedOutletState] = useState<Outlet | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/outlets')
      .then((r) => r.json())
      .then((data: Outlet[]) => {
        setOutlets(data)
        // Restore from sessionStorage or default to first
        const stored = sessionStorage.getItem('selectedOutletId')
        const match = data.find((o) => o.id === stored) ?? data[0] ?? null
        setSelectedOutletState(match)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  const setSelectedOutlet = useCallback((outlet: Outlet) => {
    setSelectedOutletState(outlet)
    sessionStorage.setItem('selectedOutletId', outlet.id)
  }, [])

  return (
    <OutletContext.Provider value={{ outlets, selectedOutlet, setSelectedOutlet, isLoading }}>
      {children}
    </OutletContext.Provider>
  )
}

export function useOutlet() {
  return useContext(OutletContext)
}
