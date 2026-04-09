import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type AdminNavContextValue = {
  isOpen: boolean
  openNav: () => void
  closeNav: () => void
  toggleNav: () => void
}

const AdminNavContext = createContext<AdminNavContextValue | null>(null)

export function AdminNavProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const openNav = useCallback(() => setOpen(true), [])
  const closeNav = useCallback(() => setOpen(false), [])
  const toggleNav = useCallback(() => setOpen((v) => !v), [])

  const value = useMemo(
    () => ({ isOpen, openNav, closeNav, toggleNav }),
    [isOpen, openNav, closeNav, toggleNav],
  )

  return <AdminNavContext.Provider value={value}>{children}</AdminNavContext.Provider>
}

export function useAdminNav(): AdminNavContextValue {
  const ctx = useContext(AdminNavContext)
  if (!ctx) {
    throw new Error('useAdminNav must be used within AdminNavProvider')
  }
  return ctx
}
