import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'

export type TableActionMenuItem =
  | {
      kind: 'button'
      label: string
      onClick: () => void
      disabled?: boolean
      danger?: boolean
      title?: string
    }
  | {
      kind: 'link'
      label: string
      to: string
      external?: boolean
    }

type Props = {
  items: TableActionMenuItem[]
  toggleLabel?: string
  disabled?: boolean
}

export function TableActionDropdown({ items, toggleLabel = '작업', disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useLayoutEffect(() => {
    if (!open || !toggleRef.current) return
    const placeMenu = () => {
      const btn = toggleRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const minW = 136
      const left = Math.min(Math.max(8, r.right - minW), window.innerWidth - minW - 8)
      setMenuStyle({
        position: 'fixed',
        top: r.bottom + 4,
        left,
        minWidth: minW,
        zIndex: 1200,
      })
    }
    placeMenu()
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!items.length) {
    return <span className="table-action-dropdown-empty">-</span>
  }

  const close = () => setOpen(false)

  return (
    <div
      ref={rootRef}
      className={'table-action-dropdown' + (open ? ' is-open' : '')}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={toggleRef}
        type="button"
        className="table-action-dropdown-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {toggleLabel}
        <span className="table-action-dropdown-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div id={menuId} className="table-action-dropdown-menu" role="menu" style={menuStyle}>
          {items.map((item, i) => {
            if (item.kind === 'link') {
              if (item.external) {
                return (
                  <a
                    key={`${item.label}-${i}`}
                    href={item.to}
                    className="table-action-dropdown-item"
                    role="menuitem"
                    target="_blank"
                    rel="noreferrer"
                    onClick={close}
                  >
                    {item.label}
                  </a>
                )
              }
              return (
                <Link
                  key={`${item.label}-${i}`}
                  to={item.to}
                  className="table-action-dropdown-item"
                  role="menuitem"
                  onClick={close}
                >
                  {item.label}
                </Link>
              )
            }
            return (
              <button
                key={`${item.label}-${i}`}
                type="button"
                className={
                  'table-action-dropdown-item' + (item.danger ? ' table-action-dropdown-item--danger' : '')
                }
                role="menuitem"
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  if (item.disabled) return
                  close()
                  item.onClick()
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
