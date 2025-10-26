import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './pages/App'
import Login from './pages/Login'
import Sites from './pages/Sites'
import SiteDetail from './pages/SiteDetail'
import 'antd/dist/reset.css'
import './index.css'

function RequireAuth({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><App /></RequireAuth>}>
          <Route index element={<Sites />} />
          <Route path="sites/:id" element={<SiteDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
