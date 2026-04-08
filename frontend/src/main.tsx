import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App.tsx'
import { ConfirmProvider } from './context/ConfirmContext.tsx'
import { logSupabaseConnectionDev } from './services/verifyDbConnection'
import './index.css'

void logSupabaseConnectionDev()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
      <Toaster
        position="top-right"
        offset={{ top: 72, right: 16 }}
        richColors={false}
        closeButton
        duration={3200}
        className="ar-sonner-toaster"
        toastOptions={{
          classNames: {
            toast: 'ar-sonner-toast',
            title: 'ar-sonner-toast-title',
            description: 'ar-sonner-toast-desc',
            closeButton: 'ar-sonner-toast-close',
          },
        }}
      />
    </ConfirmProvider>
  </StrictMode>,
)
