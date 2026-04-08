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
import { AdminLayout } from './components/admin/AdminLayout'
import { AdminRootLayout } from './components/admin/AdminRootLayout'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { AdminUserDetailPage } from './pages/AdminUserDetailPage'
import { AdminExpPage } from './pages/AdminExpPage'
import { AdminNoticesPage } from './pages/AdminNoticesPage'
import { AdminFeedbackListPage } from './pages/AdminFeedbackListPage'
import { AdminFeedbackDetailPage } from './pages/AdminFeedbackDetailPage'

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
        <Route path="/admin" element={<AdminRootLayout />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:userId" element={<AdminUserDetailPage />} />
            <Route path="exp" element={<AdminExpPage />} />
            <Route path="notices" element={<AdminNoticesPage />} />
            <Route path="feedback" element={<AdminFeedbackListPage />} />
            <Route path="feedback/:feedbackId" element={<AdminFeedbackDetailPage />} />
          </Route>
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
