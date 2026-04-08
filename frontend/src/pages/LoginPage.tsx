import { useState, type FormEvent } from 'react'
import { HiArrowPath } from 'react-icons/hi2'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  loadSavedLoginEmail,
  persistLoginEmail,
  signInWithEmailPassword,
} from '../services/authService'
import { staticUrl } from '../lib/api'

const LOGO_KEY = 'headerLogo'

function loginPageInitialPrefs() {
  const { email, saveChecked } = loadSavedLoginEmail()
  let logo2 = false
  try {
    logo2 = localStorage.getItem(LOGO_KEY) === 'logo2'
  } catch {
    /* ignore */
  }
  return { email, saveEmail: saveChecked, logo2 }
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [prefs, setPrefs] = useState(() => loginPageInitialPrefs())
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(true)

  function toggleLogo() {
    const next = !prefs.logo2
    setPrefs((p) => ({ ...p, logo2: next }))
    try {
      localStorage.setItem(LOGO_KEY, next ? 'logo2' : 'logo')
    } catch {
      /* ignore */
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    const next = searchParams.get('next')
    const emailTrim = prefs.email.trim()
    if (!emailTrim || !password) {
      setMessageIsError(true)
      setMessage('이메일과 비밀번호를 입력해 주세요.')
      return
    }

    try {
      await signInWithEmailPassword(emailTrim, password)
      persistLoginEmail(emailTrim, prefs.saveEmail)
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        navigate(next, { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setMessageIsError(true)
      const raw = err instanceof Error ? err.message : ''
      setMessage(raw || '로그인에 실패했습니다. 다시 시도해 주세요.')
    }
  }

  const logoSrc = prefs.logo2 ? staticUrl('/logo2.png') : staticUrl('/logo.png')

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6 font-sans text-[#212121]"
      style={{
        background: `url('${staticUrl('/background.jpg')}') center / cover no-repeat fixed`,
      }}
    >
      <div className="flex w-full max-w-md flex-col items-center">
        <div className="w-full rounded-2xl bg-white py-10 px-8 shadow-lg shadow-blue-500/10">
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <img
              src={logoSrc}
              alt="Ntpercent"
              className={`h-auto max-w-full object-contain ${prefs.logo2 ? 'w-60' : 'w-44'}`}
            />
            <button
              type="button"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-gray-400 bg-white text-lg text-gray-400 transition-colors hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700"
              title="로고 변경"
              aria-label="로고 변경"
              onClick={toggleLogo}
            >
              <HiArrowPath className="size-4 text-current" aria-hidden />
            </button>
          </div>

          <h2 className="mb-7 text-center text-xl font-semibold text-[#212121]">로그인</h2>

          {message ? (
            <div
              className={`mb-4 rounded-lg px-3.5 py-2.5 text-center text-sm ${
                messageIsError ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-900'
              }`}
              role="alert"
            >
              {message}
            </div>
          ) : null}

          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#212121]">
                이메일
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-400 px-4 py-3.5 text-sm font-medium text-[#212121] outline-none transition-colors placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                value={prefs.email}
                onChange={(e) => setPrefs((p) => ({ ...p, email: e.target.value }))}
                placeholder="example@email.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[#212121]">
                비밀번호
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-400 px-4 py-3.5 text-sm font-medium text-[#212121] outline-none transition-colors placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
              />
            </div>

            <div className="-mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="saveEmail"
                name="save_email"
                checked={prefs.saveEmail}
                onChange={(e) => setPrefs((p) => ({ ...p, saveEmail: e.target.checked }))}
                className="size-4 cursor-pointer accent-blue-600"
              />
              <label htmlFor="saveEmail" className="cursor-pointer select-none text-sm text-gray-400">
                아이디 저장
              </label>
            </div>

            <p className="mt-4 mb-0 text-center text-xs font-semibold leading-normal text-blue-700">
              <Link to="/find-account" className="text-inherit no-underline hover:underline">
                아이디/비밀번호 찾기
              </Link>
            </p>

            <button
              type="submit"
              className="mt-2 w-full cursor-pointer rounded-lg border-none bg-blue-600 py-3.5 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700"
            >
              로그인
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            아직 계정이 없으신가요?{' '}
            <Link to="/signup" className="font-medium text-blue-700 no-underline hover:underline">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
