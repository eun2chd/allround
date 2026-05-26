import { useCallback, useId, useRef, useState } from 'react'
import { appToast } from '../../lib/appToast'
import {
  PARTICIPATION_FILE_ACCEPT_ATTR,
  PARTICIPATION_FILE_HINT,
  isAllowedParticipationFile,
  participationFileRejectMessage,
} from '../../features/participation/participationFileUpload'

type Props = {
  onFile: (file: File | null) => void
  /** 드롭존 포커스 시 모달 붙여넣기 대상 지정용 */
  onActivate?: () => void
  disabled?: boolean
  /** 선택·붙여넣기된 파일명 표시 */
  pendingName?: string | null
  className?: string
}

function pickFirstFile(list: FileList | null | undefined): File | null {
  if (!list?.length) return null
  return list[0] ?? null
}

export function ParticipationFileDropzone({
  onFile,
  onActivate,
  disabled,
  pendingName,
  className,
}: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const applyFile = useCallback(
    (raw: File | null) => {
      if (!raw) return
      if (!isAllowedParticipationFile(raw)) {
        appToast(participationFileRejectMessage(), 'error')
        return
      }
      onFile(raw)
    },
    [onFile],
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = pickFirstFile(e.target.files)
    if (f) applyFile(f)
    e.target.value = ''
  }

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    onActivate?.()
    setDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (disabled) return
    const f = pickFirstFile(e.dataTransfer.files)
    if (f) applyFile(f)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    if (disabled) return
    const f = pickFirstFile(e.clipboardData.files)
    if (!f) return
    e.preventDefault()
    e.stopPropagation()
    applyFile(f)
  }

  const openPicker = () => {
    if (disabled) return
    inputRef.current?.click()
  }

  const zoneClass =
    'participation-file-dropzone' +
    (dragOver ? ' participation-file-dropzone--over' : '') +
    (disabled ? ' participation-file-dropzone--disabled' : '') +
    (className ? ` ${className}` : '')

  return (
    <div className={zoneClass}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="participation-file-dropzone-input"
        accept={PARTICIPATION_FILE_ACCEPT_ATTR}
        disabled={disabled}
        onChange={onInputChange}
        tabIndex={-1}
      />
      <div
        className="participation-file-dropzone-surface"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={inputId}
        onClick={openPicker}
        onFocus={() => onActivate?.()}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openPicker()
          }
        }}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaste={onPaste}
      >
        {pendingName ? (
          <p className="participation-file-dropzone-name" title={pendingName}>
            {pendingName}
          </p>
        ) : (
          <p className="participation-file-dropzone-lead">
            파일을 여기로 <strong>끌어다 놓기</strong> · <strong>붙여넣기</strong>(Ctrl+V) ·{' '}
            <strong>클릭</strong>하여 선택
          </p>
        )}
        <p className="participation-file-dropzone-hint">{PARTICIPATION_FILE_HINT}</p>
      </div>
    </div>
  )
}
