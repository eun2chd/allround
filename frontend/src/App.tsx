import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { PasswordChangePage } from './pages/PasswordChangePage'
import { FindAccountPage } from './pages/FindAccountPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { LogoutPage } from './pages/LogoutPage'
import { MypagePage } from './pages/MypagePage'
import { FeedbackPage } from './pages/FeedbackPage'
import { NoticesPage } from './pages/NoticesPage'
import { ParticipationStatusPage } from './pages/ParticipationStatusPage'
import { TeamDashboardPage } from './pages/TeamDashboardPage'
import { BookmarksPage } from './pages/BookmarksPage'
import { SignupCompletePage } from './pages/SignupCompletePage'
import { SignupPage } from './pages/SignupPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/mypage/:userId" element={<MypagePage />} />
          <Route path="/mypage/password" element={<PasswordChangePage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/notices" element={<NoticesPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/participation-status" element={<ParticipationStatusPage />} />
          <Route path="/team" element={<TeamDashboardPage />} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/logout" element={<LogoutPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/signup/complete" element={<SignupCompletePage />} />
        <Route path="/find-account" element={<FindAccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
