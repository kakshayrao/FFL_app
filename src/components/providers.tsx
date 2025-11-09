'use client'

import { SessionProvider } from 'next-auth/react'
import { useEffect } from 'react'

export default function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  }, []);
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  )
}


