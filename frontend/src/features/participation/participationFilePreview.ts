import { getSupabase } from '../../services/supabaseClient'

const CONTEST_BUCKET = 'contest'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export function fileExtFromName(name: string): string {
  const n = String(name || '').toLowerCase()
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1) : ''
}

export function isParticipationImageFile(filename: string | null | undefined): boolean {
  return IMAGE_EXT.has(fileExtFromName(String(filename || '')))
}

/** 저장 경로·공개 URL → 열기용 URL */
export function resolveParticipationFileUrl(path: string | null | undefined): string | null {
  const p = String(path || '').trim()
  if (!p) return null
  if (/^https?:\/\//i.test(p)) return p
  const storagePath = p.replace(/^\//, '')
  const { data } = getSupabase().storage.from(CONTEST_BUCKET).getPublicUrl(storagePath)
  return data?.publicUrl || null
}

const POPUP_TARGET_PREFIX = 'participationFilePreview_'
const POPUP_WIDTH = 960
const POPUP_HEIGHT = 720
const POPUP_MARGIN = 48

function participationFilePopupFeatures(): string {
  const maxW = Math.max(480, window.screen.availWidth - POPUP_MARGIN * 2)
  const maxH = Math.max(360, window.screen.availHeight - POPUP_MARGIN * 2)
  const width = Math.min(POPUP_WIDTH, maxW)
  const height = Math.min(POPUP_HEIGHT, maxH)
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2))
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2))
  return [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    'toolbar=no',
    'menubar=no',
    'location=yes',
    'status=no',
  ].join(',')
}

/** 새 탭이 아닌 지정 크기 팝업 창으로 열기 (전체 화면 아님) */
export function openParticipationFile(url: string | null | undefined): void {
  const resolved = url?.trim() ? (resolveParticipationFileUrl(url) ?? url.trim()) : null
  if (!resolved) return
  const target = POPUP_TARGET_PREFIX + Date.now()
  const win = window.open(resolved, target, participationFilePopupFeatures())
  if (win) {
    try {
      win.opener = null
    } catch {
      /* cross-origin 등 */
    }
    win.focus()
  }
}
