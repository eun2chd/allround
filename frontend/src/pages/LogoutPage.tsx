import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { signOutEverywhere } from '../services/authService'

export function LogoutPage() {
  useEffect(() => {
    void signOutEverywhere()
  }, [])

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-5 py-12 font-sans text-gray-500">
      <p className="mb-6 text-center text-[0.95rem]">로그아웃되었습니다.</p>
      <Link to="/" className="text-blue-600 hover:underline">
        홈으로
      </Link>
    </div>
  )
}
