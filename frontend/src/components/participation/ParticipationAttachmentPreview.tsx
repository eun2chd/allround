import { useEffect, useState } from 'react'
import { HiDocument, HiOutlineArrowsPointingOut } from 'react-icons/hi2'
import {
  isParticipationImageFile,
  openParticipationFile,
  resolveParticipationFileUrl,
} from '../../features/participation/participationFilePreview'

type Props = {
  /** 미리보기 위 제목 (제출물 / 수상작) */
  heading: string
  filename?: string | null
  path?: string | null
  /** 저장 전 로컬 파일 */
  localFile?: File | null
  onRemove?: () => void
}

export function ParticipationAttachmentPreview({
  heading,
  filename,
  path,
  localFile,
  onRemove,
}: Props) {
  const [localUrl, setLocalUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!localFile) {
      setLocalUrl(null)
      return
    }
    const url = URL.createObjectURL(localFile)
    setLocalUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [localFile])

  const displayName = localFile?.name || String(filename || '').trim()
  const n = displayName.toLowerCase()
  const dot = n.lastIndexOf('.')
  const ext = dot >= 0 ? n.slice(dot + 1).toUpperCase() : 'FILE'

  if (!displayName) return null

  const remoteUrl = resolveParticipationFileUrl(path)
  const previewUrl = localUrl || remoteUrl
  const isImage = localFile
    ? localFile.type.startsWith('image/') || isParticipationImageFile(displayName)
    : isParticipationImageFile(displayName)

  const openLarge = () => {
    if (previewUrl) openParticipationFile(previewUrl)
    else if (path) openParticipationFile(path)
  }

  return (
    <div className="participation-attachment-block">
      <div className="participation-attachment-heading">{heading}</div>
      <button
        type="button"
        className="participation-attachment-preview"
        onClick={openLarge}
        disabled={!previewUrl && !path}
        title={displayName}
        aria-label={`${heading} 크게 보기: ${displayName}`}
      >
        <div className="participation-attachment-preview-frame">
          {isImage && previewUrl ? (
            <img src={previewUrl} alt="" className="participation-attachment-preview-img" />
          ) : (
            <div className="participation-attachment-preview-file" aria-hidden>
              <HiDocument className="participation-attachment-preview-file-ico" />
              <span className="participation-attachment-preview-ext">{ext}</span>
            </div>
          )}
          <span className="participation-attachment-preview-zoom" aria-hidden>
            <HiOutlineArrowsPointingOut />
          </span>
        </div>
        <span className="participation-attachment-preview-name">{displayName}</span>
      </button>
      {onRemove ? (
        <button
          type="button"
          className="btn-outline btn-sm participation-attachment-remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          제거
        </button>
      ) : null}
    </div>
  )
}
