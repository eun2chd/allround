import type { MouseEvent } from 'react'

/** 테이블 행 클릭 시 버튼·링크·드롭다운 클릭은 무시 */
export function isParticipationTableRowActionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest(
    'button, a, input, select, textarea, label, .table-action-dropdown, .participation-file-dropzone',
  )
}

export function onParticipationTableRowClick(
  e: MouseEvent,
  open: () => void,
): void {
  if (isParticipationTableRowActionTarget(e.target)) return
  open()
}
