import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppRouter } from '@/routes/Router'
import { AuthProvider } from '@/context/AuthContext'
import 'react-datepicker/dist/react-datepicker.css';
import '@/styles/main.scss'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider> 
      <AppRouter />
    </AuthProvider>
  </React.StrictMode>,
)
