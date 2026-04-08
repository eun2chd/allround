import { getSupabase } from './supabaseClient'

export const PASSWORD_RULE_MESSAGE =
  '비밀번호는 6자 이상, 문자 또는 숫자만 사용해 주세요. 숫자만·문자만도 가능하고 연속해서 입력해도 되며, 반드시 섞지 않아도 됩니다. 특수문자·공백은 넣을 수 없습니다.'

export function validateSignupPassword(pw: string): boolean {
  return pw.length >= 6 && /^[\p{L}\p{N}]+$/u.test(pw)
}

/** 비밀번호 변경 전용: 숫자만, 6자리 이상 */
export const PASSWORD_CHANGE_RULE_MESSAGE = '새 비밀번호는 숫자만 사용하며 6자리 이상이어야 합니다.'

export function validatePasswordChangeDigits(pw: string): boolean {
  return pw.length >= 6 && /^\d+$/.test(pw)
}

export function mapLoginError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('email not confirmed') || m.includes('email not validated')) {
    return '이메일 인증이 완료되지 않았습니다. 인증 메일을 확인해 주세요.'
  }
  if (m.includes('invalid login') || m.includes('invalid_credentials') || m.includes('invalid grant')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  }
  if (m.includes('user not found')) {
    return '등록되지 않은 이메일입니다.'
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  }
  return '로그인에 실패했습니다. 다시 시도해 주세요.'
}

export function mapSignupError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already')) {
    return '이미 등록된 이메일입니다.'
  }
  return '회원가입에 실패했습니다. 다시 시도해 주세요.'
}

const SAVED_EMAIL_KEY = 'ntp_saved_email'

export function loadSavedLoginEmail(): { email: string; saveChecked: boolean } {
  try {
    const email = localStorage.getItem(SAVED_EMAIL_KEY) || ''
    return { email, saveChecked: Boolean(email) }
  } catch {
    return { email: '', saveChecked: false }
  }
}

export function persistLoginEmail(email: string, save: boolean) {
  try {
    if (save && email.trim()) localStorage.setItem(SAVED_EMAIL_KEY, email.trim())
    else localStorage.removeItem(SAVED_EMAIL_KEY)
  } catch {
    /* ignore */
  }
}

/** profiles 기준 중복 여부 (RLS에 따라 실패 시 null) */
export async function checkProfileEmailExists(email: string): Promise<boolean | null> {
  const trimmed = email.trim()
  if (!trimmed || !trimmed.includes('@')) return null
  const sb = getSupabase()
  const { data, error } = await sb.from('profiles').select('id').eq('email', trimmed).limit(1).maybeSingle()
  if (error) return null
  return Boolean(data)
}

export async function checkProfileNicknameExists(nickname: string): Promise<boolean | null> {
  const trimmed = nickname.trim()
  if (!trimmed) return null
  const sb = getSupabase()
  const { data, error } = await sb.from('profiles').select('id').eq('nickname', trimmed).limit(1).maybeSingle()
  if (error) return null
  return Boolean(data)
}

/** 닉네임으로 가입 이메일 조회 (아이디 찾기). RLS에 따라 실패할 수 있음. */
export async function lookupProfileEmailByNickname(
  nickname: string,
): Promise<{ email: string | null; errorMessage?: string }> {
  const trimmed = nickname.trim()
  if (!trimmed) return { email: null, errorMessage: '닉네임을 입력해 주세요.' }
  const sb = getSupabase()
  const { data, error } = await sb.from('profiles').select('email').eq('nickname', trimmed).maybeSingle()
  if (error) return { email: null, errorMessage: '회원 정보를 조회하지 못했습니다.' }
  const email = data?.email
  if (typeof email !== 'string' || !email.trim()) {
    return { email: null, errorMessage: '일치하는 회원을 찾을 수 없습니다.' }
  }
  return { email }
}

export async function signInWithEmailPassword(email: string, password: string) {
  const sb = getSupabase()
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(mapLoginError(error.message))
  return data
}

export async function signUpWithProfile(email: string, password: string, nickname: string) {
  const sb = getSupabase()
  const em = email.trim()
  const nick = nickname.trim()
  const redirect = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined
  const { data, error } = await sb.auth.signUp({
    email: em,
    password,
    options: {
      data: { nickname: nick },
      emailRedirectTo: redirect,
    },
  })
  if (error) throw new Error(mapSignupError(error.message))
  const uid = data.user?.id
  if (uid) {
    const { error: upErr } = await sb.from('profiles').upsert(
      { id: uid, email: em, nickname: nick, role: 'member' },
      { onConflict: 'id' },
    )
    if (upErr) throw new Error(upErr.message || '프로필 저장에 실패했습니다.')
  }
  return data
}

export async function resendSignupVerification(email: string) {
  const sb = getSupabase()
  const { error } = await sb.auth.resend({ type: 'signup', email: email.trim() })
  if (error) throw new Error(error.message || '메일 발송에 실패했습니다.')
}

export async function requestPasswordResetEmail(email: string): Promise<{ message: string }> {
  const sb = getSupabase()
  const redirect = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect })
  if (error) {
    return { message: error.message || '메일 발송에 실패했습니다.' }
  }
  return { message: '비밀번호 재설정 링크를 메일로 보냈습니다. 메일함을 확인해 주세요.' }
}

export async function signOutEverywhere() {
  const sb = getSupabase()
  await sb.auth.signOut()
}

export function mapUpdatePasswordError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('same_password') || m.includes('same password')) {
    return '이전과 동일한 비밀번호는 사용할 수 없습니다.'
  }
  if (m.includes('weak_password') || m.includes('weak password')) {
    return PASSWORD_RULE_MESSAGE
  }
  if (m.includes('session') && m.includes('expired')) {
    return '세션이 만료되었습니다. 다시 로그인한 뒤 변경해 주세요.'
  }
  if (m.includes('nonce') || m.includes('reauthenticat')) {
    return '보안 설정상 이메일로 받은 인증 후 다시 시도해야 할 수 있습니다.'
  }
  return message || '비밀번호 변경에 실패했습니다.'
}

/** 새 비밀번호 적용 (로그인 세션 필요). 클라이언트에서는 숫자 6자리 이상만 허용. */
export async function updateAuthPassword(newPassword: string) {
  const sb = getSupabase()
  const { error } = await sb.auth.updateUser({ password: newPassword })
  if (error) throw new Error(mapUpdatePasswordError(error.message))
}
