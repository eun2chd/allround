import type { ButtonHTMLAttributes } from 'react'

type EllipsisProps = {
  text: string
  className?: string
  emptyLabel?: string
  /** 기본값: `text` (말줄임 전체 표시용) */
  title?: string
}

function labelText(text: string, emptyLabel: string): string {
  const t = (text || '').trim()
  return t || emptyLabel
}

/** 테이블 셀 말줄임 + 전체 텍스트 `title` 툴팁 */
export function TableEllipsis({ text, className = '', emptyLabel = '-', title }: EllipsisProps) {
  const label = labelText(text, emptyLabel)
  const tip = title ?? (label === emptyLabel ? undefined : label)
  return (
    <span className={`table-cell-ellipsis${className ? ` ${className}` : ''}`} title={tip}>
      {label}
    </span>
  )
}

type BtnProps = EllipsisProps &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled' | 'type'> & {
    btnClassName?: string
  }

export function TableEllipsisButton({
  text,
  className = '',
  btnClassName = '',
  emptyLabel = '-',
  onClick,
  disabled,
  type = 'button',
}: BtnProps) {
  const label = labelText(text, emptyLabel)
  const tip = label === emptyLabel ? undefined : label
  return (
    <button
      type={type}
      className={`table-cell-ellipsis-btn${btnClassName ? ` ${btnClassName}` : ''}`}
      title={tip}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={`table-cell-ellipsis${className ? ` ${className}` : ''}`}>{label}</span>
    </button>
  )
}
