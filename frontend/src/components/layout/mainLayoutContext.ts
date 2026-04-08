import { useOutletContext } from 'react-router-dom'
import type { MeData } from '../../hooks/useAuthMe'

export type MainLayoutOutletContext = {
  me: MeData
  hubTab: 'allyoung' | 'startup'
  setHubTab: (t: 'allyoung' | 'startup') => void
}

/** HMR 등으로 Outlet context가 비는 순간이 있어 null 대비 */
export function useMainLayoutOutletContext(): MainLayoutOutletContext | null {
  const ctx = useOutletContext<MainLayoutOutletContext | null | undefined>()
  return ctx ?? null
}
