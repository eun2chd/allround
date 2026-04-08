import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  PASSWORD_RULE_MESSAGE,
  checkProfileEmailExists,
  checkProfileNicknameExists,
  signUpWithProfile,
  validateSignupPassword,
} from '../services/authService'
import { staticUrl } from '../lib/api'

export function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState('')
  const [nicknameCheck, setNicknameCheck] = useState<'idle' | 'checking' | 'ok' | 'dup' | 'unknown'>('idle')
  const [emailCheck, setEmailCheck] = useState<'idle' | 'checking' | 'ok' | 'dup' | 'unknown'>('idle')

  useEffect(() => {
    const n = nickname.trim()
    if (!n) {
      setNicknameCheck('idle')
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setNicknameCheck('checking')
      const taken = await checkProfileNicknameExists(n)
      if (!cancelled) {
        if (taken === null) setNicknameCheck('unknown')
        else setNicknameCheck(taken ? 'dup' : 'ok')
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [nickname])

  useEffect(() => {
    const em = email.trim()
    if (!em.includes('@')) {
      setEmailCheck('idle')
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setEmailCheck('checking')
      const exists = await checkProfileEmailExists(em)
      if (!cancelled) {
        if (exists === null) setEmailCheck('unknown')
        else setEmailCheck(exists ? 'dup' : 'ok')
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [email])

  const dupBorder = 'border-[#b91c1c]'
  const inputBase =
    'w-full rounded-lg border px-[14px] py-3 font-sans text-[0.95rem] font-medium text-[#212121] outline-none transition-[border-color,box-shadow] placeholder:text-gray-400 focus:border-[#2563eb] focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]'
  const nicknameBorder = nicknameCheck === 'dup' ? dupBorder : 'border-[#9ca3af]'
  const emailBorder = emailCheck === 'dup' ? dupBorder : 'border-[#9ca3af]'

  function nicknameHint() {
    if (nicknameCheck === 'dup') {
      return (
        <p className="field-hint invalid mt-1.5 text-[0.8rem] text-[#b91c1c]">이미 사용 중인 닉네임입니다.</p>
      )
    }
    if (nicknameCheck === 'ok') {
      return <p className="field-hint valid mt-1.5 text-[0.8rem] text-[#2563eb]">사용 가능합니다.</p>
    }
    if (nicknameCheck === 'unknown') {
      return (
        <p className="field-hint mt-1.5 text-[0.8rem] text-amber-700">
          중복 여부를 확인하지 못했습니다. 다시 시도해 주세요.
        </p>
      )
    }
    if (nicknameCheck === 'checking') {
      return <p className="field-hint checking mt-1.5 text-[0.8rem] text-gray-400">확인 중...</p>
    }
    return null
  }

  function emailHint() {
    if (emailCheck === 'dup') {
      return (
        <p className="field-hint invalid mt-1.5 text-[0.8rem] text-[#b91c1c]">이미 사용 중인 이메일입니다.</p>
      )
    }
    if (emailCheck === 'ok') {
      return <p className="field-hint valid mt-1.5 text-[0.8rem] text-[#2563eb]">사용 가능합니다.</p>
    }
    if (emailCheck === 'unknown') {
      return (
        <p className="field-hint mt-1.5 text-[0.8rem] text-amber-700">
          중복 여부를 확인하지 못했습니다. 다시 시도해 주세요.
        </p>
      )
    }
    if (emailCheck === 'checking') {
      return <p className="field-hint checking mt-1.5 text-[0.8rem] text-gray-400">확인 중...</p>
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage('')

    const emailTrim = email.trim()
    const nicknameTrim = nickname.trim()

    if (!emailTrim || !password || !nicknameTrim) {
      setMessage('필수 항목을 모두 입력해 주세요.')
      return
    }
    if (password !== password2) {
      setMessage('비밀번호가 일치하지 않습니다.')
      return
    }
    if (!validateSignupPassword(password)) {
      setMessage(PASSWORD_RULE_MESSAGE)
      return
    }
    if (nicknameCheck === 'dup' || emailCheck === 'dup') {
      setMessage('닉네임 또는 이메일을 확인해 주세요.')
      return
    }

    try {
      await signUpWithProfile(emailTrim, password, nicknameTrim)
      navigate('/signup/complete', { replace: true, state: { email: emailTrim } })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '가입 처리 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 font-sans font-medium text-[#212121]">
      <div className="flex w-full max-w-[520px] flex-col items-center">
        <div className="w-full rounded-2xl border border-[#9ca3af] bg-white px-8 py-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <img
            src={staticUrl('/logo.png')}
            alt="Ntpercent"
            className="mx-auto mb-6 block h-auto w-[180px] max-w-full object-contain"
          />
          <h2 className="mb-7 text-center text-xl font-semibold leading-normal text-[#212121]">회원가입</h2>

          {message ? (
            <div
              className="mb-4 rounded-lg bg-[#fef2f2] px-3.5 py-2.5 text-center text-[0.9rem] text-[#b91c1c]"
              role="alert"
            >
              {message}
            </div>
          ) : null}

          <form className="signup-form" onSubmit={handleSubmit}>
            <div className="flex flex-col">
              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4 py-[14px]">
                <label
                  htmlFor="su-email"
                  className="text-left text-[0.9rem] font-medium text-[#212121]"
                >
                  이메일
                </label>
                <div className="min-w-0">
                  <input
                    id="su-email"
                    type="email"
                    required
                    autoComplete="email"
                    className={`${inputBase} ${emailBorder}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                  />
                  {emailHint()}
                </div>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4 py-[14px]">
                <label
                  htmlFor="su-password"
                  className="text-left text-[0.9rem] font-medium text-[#212121]"
                >
                  비밀번호
                </label>
                <div className="min-w-0">
                  <input
                    id="su-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={`${inputBase} border-[#9ca3af]`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                      placeholder="6자 이상, 문자·숫자만 (섞지 않아도 됨)"
                  />
                  <small className="mt-1.5 block max-w-full text-[0.8rem] leading-normal text-gray-400 break-keep">
                    {PASSWORD_RULE_MESSAGE}
                  </small>
                </div>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4 py-[14px]">
                <label
                  htmlFor="su-password2"
                  className="text-left text-[0.9rem] font-medium text-[#212121]"
                >
                  비밀번호 확인
                </label>
                <div className="min-w-0">
                  <input
                    id="su-password2"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={`${inputBase} border-[#9ca3af]`}
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="비밀번호 다시 입력"
                  />
                </div>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4 py-[14px]">
                <label
                  htmlFor="su-nickname"
                  className="text-left text-[0.9rem] font-medium text-[#212121]"
                >
                  닉네임
                </label>
                <div className="min-w-0">
                  <input
                    id="su-nickname"
                    type="text"
                    required
                    autoComplete="nickname"
                    className={`${inputBase} ${nicknameBorder}`}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="닉네임 입력"
                  />
                  {nicknameHint()}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="mt-6 w-full cursor-pointer rounded-lg border-none bg-[#2563eb] py-3.5 px-6 text-base font-semibold text-white hover:bg-[#1d4ed8]"
            >
              가입하기
            </button>
          </form>

          <p className="mt-6 text-center text-[0.9rem] text-gray-400">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="font-medium text-[#2563eb] no-underline">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
