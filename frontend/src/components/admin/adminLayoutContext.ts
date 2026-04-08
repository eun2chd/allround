import { useOutletContext } from 'react-router-dom'
import type { MeData } from '../../hooks/useAuthMe'

export type AdminOutletContext = {
  me: MeData
}

export function useAdminOutletContext(): AdminOutletContext | null {
  const ctx = useOutletContext<AdminOutletContext | null | undefined>()
  return ctx ?? null
}
