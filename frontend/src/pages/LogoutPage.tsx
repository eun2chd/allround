import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOutEverywhere } from '../services/authService'

/** 직접 URL 접근 시에도 세션 종료 후 로그인 화면으로 보냄 */
export function LogoutPage() {
  const navigate = useNavigate()

  useEffect(() => {
    void (async () => {
      await signOutEverywhere()
      navigate('/login', { replace: true })
    })()
  }, [navigate])

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-5 py-12 font-sans text-gray-500">
      <p className="text-center text-[0.95rem]">로그아웃 중…</p>
    </div>
  )
}
