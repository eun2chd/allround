import { Link } from 'react-router-dom'
import { useMainLayoutOutletContext } from '../components/layout/mainLayoutContext'

export function PlaceholderPage({ title }: { title: string }) {
  const ctx = useMainLayoutOutletContext()
  if (!ctx) {
    return null
  }

  return (
    <div className="container" style={{ padding: '48px 24px' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: 16 }}>{title}</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>이 페이지는 아직 준비 중입니다.</p>
      <Link to="/" style={{ color: '#2563eb' }}>
        홈으로
      </Link>
    </div>
  )
}
