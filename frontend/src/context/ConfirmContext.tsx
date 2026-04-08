import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type ConfirmOptions = {
  /** 기본: 확인 */
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  /** true면 확인 버튼을 강조(위험 동작) */
  danger?: boolean
}

type DialogState = ConfirmOptions & { open: boolean }

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | undefined>(undefined)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({ open: true, ...opts })
    })
  }, [])

  const close = useCallback((value: boolean) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setState(null)
  }, [])

  useEffect(() => {
    if (!state?.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state?.open, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state?.open
        ? createPortal(
            <div
              className="ar-confirm-backdrop"
              role="presentation"
              onClick={() => close(false)}
              onKeyDown={(e) => e.key === 'Escape' && close(false)}
            >
              <div
                className="ar-confirm-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="ar-confirm-title"
                aria-describedby="ar-confirm-desc"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="ar-confirm-title" className="ar-confirm-title">
                  {state.title ?? '확인'}
                </h2>
                <p id="ar-confirm-desc" className="ar-confirm-message">
                  {state.message}
                </p>
                <div className="ar-confirm-actions">
                  <button type="button" className="ar-confirm-btn ar-confirm-btn-cancel" onClick={() => close(false)}>
                    {state.cancelText ?? '취소'}
                  </button>
                  <button
                    type="button"
                    className={
                      'ar-confirm-btn ar-confirm-btn-ok' + (state.danger ? ' ar-confirm-btn-danger' : '')
                    }
                    onClick={() => close(true)}
                  >
                    {state.confirmText ?? '확인'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (ctx === undefined) {
    throw new Error('useConfirm은 ConfirmProvider 안에서만 사용할 수 있습니다.')
  }
  return ctx
}
