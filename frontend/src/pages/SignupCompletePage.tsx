import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { resendSignupVerification } from '../services/authService'
import { staticUrl } from '../lib/api'

export function SignupCompletePage() {
  const location = useLocation()
  const signupEmail = (location.state as { email?: string } | null)?.email ?? ''
  const [resendEmail, setResendEmail] = useState(signupEmail)
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [resendBusy, setResendBusy] = useState(false)

  async function handleResend(e: FormEvent) {
    e.preventDefault()
    setResendMsg(null)
    const em = resendEmail.trim()
    if (!em) {
      setResendMsg({ ok: false, text: '이메일을 입력해 주세요.' })
      return
    }
    setResendBusy(true)
    try {
      await resendSignupVerification(em)
      setResendMsg({ ok: true, text: '인증 메일을 다시 보냈습니다.' })
    } catch (err) {
      setResendMsg({
        ok: false,
        text: err instanceof Error ? err.message : '메일 발송에 실패했습니다.',
      })
    } finally {
      setResendBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 font-sans text-[#212121]">
      <div className="w-full max-w-md text-center">
        <img
          src={staticUrl('/logo.png')}
          alt="Ntpercent"
          className="mx-auto mb-8 block h-auto w-44 max-w-full object-contain sm:w-48"
        />
        <div className="px-8 py-12">
          <h2 className="mb-3 text-center text-2xl font-semibold text-[#212121]">가입 완료</h2>
          <p className="mb-8 text-sm leading-relaxed text-gray-400 sm:text-base">
            회원가입이 완료되었습니다.
            <br />
            이메일 인증 후 로그인해 주세요.
          </p>

          <Link
            to="/login"
            className="inline-block cursor-pointer rounded-lg border-none bg-blue-600 px-8 py-3.5 text-base font-semibold text-white no-underline transition-colors hover:bg-blue-700"
          >
            로그인하러 가기
          </Link>

          <div className="mt-8 border-t border-gray-200 pt-6">
            <p className="mb-3 text-sm text-gray-400">회원가입 후 이메일 인증 링크를 못받으셨나요?</p>
            <p className="mb-3 text-sm text-gray-400">이메일을 입력하면 인증 링크를 다시 보내드립니다.</p>
            <form className="flex flex-wrap items-stretch justify-center gap-2" onSubmit={handleResend}>
              <input
                type="email"
                name="email"
                required
                placeholder="example@email.com"
                className="min-w-40 flex-1 rounded-lg border border-gray-300 px-3.5 py-2.5 font-sans text-sm outline-none focus:border-blue-600 sm:min-w-44"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
              />
              <button
                type="submit"
                disabled={resendBusy}
                className="cursor-pointer rounded-lg border border-blue-600 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-600 hover:text-white disabled:opacity-60"
              >
                {resendBusy ? '발송 중…' : '인증 메일 다시 받기'}
              </button>
            </form>
            {resendMsg ? (
              <p
                className={`mt-3 text-xs sm:text-sm ${resendMsg.ok ? 'text-blue-900' : 'text-red-700'}`}
                role="status"
              >
                {resendMsg.text}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
