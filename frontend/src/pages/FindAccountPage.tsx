import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  PASSWORD_RULE_MESSAGE,
  lookupProfileEmailByNickname,
  requestPasswordResetEmail,
  validateSignupPassword,
} from '../services/authService'
import { staticUrl } from '../lib/api'

const field =
  'w-full rounded-lg border border-gray-400 px-4 py-3.5 font-sans text-sm font-medium text-[#212121] outline-none transition-colors placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20'

export function FindAccountPage() {
  const [tab, setTab] = useState<'id' | 'password'>('id')
  const [idNickname, setIdNickname] = useState('')
  const [pwNickname, setPwNickname] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [flash, setFlash] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  function clearFlashOnTab() {
    setFlash(null)
  }

  async function submitId(e: FormEvent) {
    e.preventDefault()
    setFlash(null)
    setBusy(true)
    const { email, errorMessage } = await lookupProfileEmailByNickname(idNickname)
    setBusy(false)
    if (errorMessage || !email) {
      setFlash({ kind: 'error', text: errorMessage ?? '일치하는 회원을 찾을 수 없습니다.' })
      return
    }
    setFlash({ kind: 'success', text: `가입하신 아이디(이메일)는 ${email} 입니다.` })
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault()
    setFlash(null)
    if (pwNew !== pwConfirm) {
      setFlash({ kind: 'error', text: '비밀번호가 일치하지 않습니다.' })
      return
    }
    if (!validateSignupPassword(pwNew)) {
      setFlash({ kind: 'error', text: PASSWORD_RULE_MESSAGE })
      return
    }
    setBusy(true)
    const { email, errorMessage } = await lookupProfileEmailByNickname(pwNickname)
    if (errorMessage || !email) {
      setBusy(false)
      setFlash({ kind: 'error', text: errorMessage ?? '일치하는 회원을 찾을 수 없습니다.' })
      return
    }
    const { message } = await requestPasswordResetEmail(email)
    setBusy(false)
    const ok = message.includes('보냈') || message.includes('메일')
    setFlash({
      kind: ok ? 'success' : 'error',
      text: ok
        ? `${message} 메일의 링크에서 새 비밀번호를 설정해 주세요.`
        : message,
    })
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6 font-sans text-[#212121]"
      style={{
        background: `url('${staticUrl('/background.jpg')}') center / cover no-repeat fixed`,
      }}
    >
      <div className="w-full max-w-md">
        <div className="w-full rounded-2xl bg-white px-8 py-10 shadow-lg shadow-blue-500/10">
          <h2 className="mb-3 text-center text-xl font-semibold text-[#212121]">아이디/비밀번호 찾기</h2>

          <div className="mb-6 flex gap-0 border-b-2 border-gray-200">
            <button
              type="button"
              className={`flex-1 cursor-pointer border-none border-b-4 bg-transparent py-3 px-4 text-sm font-semibold transition-colors sm:text-base ${
                tab === 'id'
                  ? 'border-b-blue-600 text-blue-700'
                  : 'border-b-transparent text-gray-400 hover:text-blue-700'
              }`}
              onClick={() => {
                setTab('id')
                clearFlashOnTab()
              }}
            >
              아이디 찾기
            </button>
            <button
              type="button"
              className={`flex-1 cursor-pointer border-none border-b-4 bg-transparent py-3 px-4 text-sm font-semibold transition-colors sm:text-base ${
                tab === 'password'
                  ? 'border-b-blue-600 text-blue-700'
                  : 'border-b-transparent text-gray-400 hover:text-blue-700'
              }`}
              onClick={() => {
                setTab('password')
                clearFlashOnTab()
              }}
            >
              비밀번호 찾기
            </button>
          </div>

          {flash ? (
            <div
              className={`mb-4 rounded-lg px-3.5 py-2.5 text-center text-sm ${
                flash.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-900'
              }`}
              role="status"
            >
              {flash.text}
            </div>
          ) : null}

          <div className={tab === 'id' ? 'block' : 'hidden'}>
            <p className="mb-6 text-center text-sm text-gray-400">
              가입 시 사용한 닉네임을 입력하면 아이디(이메일)를 확인할 수 있습니다.
            </p>
            <form className="flex flex-col gap-5" onSubmit={submitId}>
              <div>
                <label htmlFor="find-nickname-id" className="mb-2 block text-sm font-medium text-[#212121]">
                  닉네임
                </label>
                <input
                  id="find-nickname-id"
                  type="text"
                  name="nickname"
                  required
                  autoComplete="username"
                  className={field}
                  value={idNickname}
                  onChange={(e) => setIdNickname(e.target.value)}
                  placeholder="닉네임 입력"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full cursor-pointer rounded-lg border-none bg-blue-600 py-3.5 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? '처리 중…' : '아이디 찾기'}
              </button>
            </form>
            <p className="py-5 text-center text-sm leading-relaxed text-gray-400">
              닉네임을 모르시면 관리자에게 문의해 주세요.
            </p>
          </div>

          <div className={tab === 'password' ? 'block' : 'hidden'}>
            <p className="mb-6 text-center text-sm leading-relaxed text-gray-400">
              가입 시 사용한 닉네임과 새 비밀번호를 입력해 주세요. 비밀번호는 6자 이상, 문자·숫자만 가능하며
              숫자만·문자만·연속 입력도 되고 섞지 않아도 됩니다.
            </p>
            <form className="flex flex-col gap-5" onSubmit={submitPassword}>
              <div>
                <label htmlFor="find-pw-nick" className="mb-2 block text-sm font-medium text-[#212121]">
                  닉네임
                </label>
                <input
                  id="find-pw-nick"
                  type="text"
                  name="nickname"
                  required
                  autoComplete="username"
                  className={field}
                  value={pwNickname}
                  onChange={(e) => setPwNickname(e.target.value)}
                  placeholder="닉네임 입력"
                />
              </div>
              <div>
                <label htmlFor="find-pw-new" className="mb-2 block text-sm font-medium text-[#212121]">
                  새 비밀번호
                </label>
                <input
                  id="find-pw-new"
                  type="password"
                  name="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={field}
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  placeholder="6자 이상, 문자·숫자만 (섞지 않아도 됨)"
                />
              </div>
              <div>
                <label htmlFor="find-pw-confirm" className="mb-2 block text-sm font-medium text-[#212121]">
                  새 비밀번호 확인
                </label>
                <input
                  id="find-pw-confirm"
                  type="password"
                  name="password_confirm"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={field}
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  placeholder="비밀번호 다시 입력"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full cursor-pointer rounded-lg border-none bg-blue-600 py-3.5 px-6 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? '처리 중…' : '비밀번호 변경'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-gray-400">
            <Link to="/login" className="font-medium text-blue-700 no-underline hover:underline">
              로그인으로 돌아가기
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
