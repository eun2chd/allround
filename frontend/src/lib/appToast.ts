import { toast } from 'sonner'

export type AppToastType = 'success' | 'error'

/** 앱 전체 통일 토스트 (위치·스타일은 `main.tsx`의 `<Toaster />`) */
export function appToast(message: string, type: AppToastType = 'success') {
  if (type === 'error') toast.error(message)
  else toast.success(message)
}
