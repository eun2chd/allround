/** 참가 상세 제출물·수상작 업로드 허용 확장자 */
export const PARTICIPATION_FILE_EXTENSIONS = [
  'pdf',
  'hwp',
  'hwpx',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'zip',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
] as const

export type ParticipationFileExtension = (typeof PARTICIPATION_FILE_EXTENSIONS)[number]

export const PARTICIPATION_FILE_EXT_SET = new Set<string>(PARTICIPATION_FILE_EXTENSIONS)

export const PARTICIPATION_FILE_ACCEPT_ATTR = PARTICIPATION_FILE_EXTENSIONS.map((e) => `.${e}`).join(',')

export const PARTICIPATION_FILE_HINT =
  'PDF · 한글(HWP/HWPX) · Word · PPT · Excel · ZIP · TXT · 이미지(PNG, JPG, GIF, WEBP)'

export function fileExtension(name: string): string {
  const n = String(name || '').toLowerCase()
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1) : ''
}

export function isAllowedParticipationFile(file: File): boolean {
  return PARTICIPATION_FILE_EXT_SET.has(fileExtension(file.name))
}

export function participationFileRejectMessage(): string {
  return `지원하지 않는 형식입니다. (${PARTICIPATION_FILE_HINT})`
}
