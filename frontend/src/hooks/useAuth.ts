import { useState, useCallback, useEffect, useRef } from 'react'
import axios from 'axios'

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return localStorage.getItem('qa_auth') === 'true'
    } catch {
      return false
    }
  })

  const [showLogin, setShowLogin] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const loginRef = useRef<HTMLDivElement>(null)

  const setLoginEmailClearErr = useCallback((v: string) => { setLoginEmail(v); setLoginError('') }, [])
  const setLoginPasswordClearErr = useCallback((v: string) => { setLoginPassword(v); setLoginError('') }, [])

  const handleLogin = useCallback(async () => {
    if (!loginEmail || !loginPassword) {
      setLoginError('Please enter email and password')
      return
    }

    setLoginLoading(true)
    setLoginError('')

    try {
      const res = await axios.post('/api/login', {
        email: loginEmail,
        password: loginPassword,
      })

      if (res.data?.success) {
        setIsLoggedIn(true)
        setShowLogin(false)
        setLoginEmail('')
        setLoginPassword('')
        setLoginError('')
        try {
          localStorage.setItem('qa_auth', 'true')
        } catch {}
      } else {
        setLoginError(res.data?.error || 'Invalid credentials')
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Invalid credentials'
      setLoginError(errorMsg)
    } finally {
      setLoginLoading(false)
    }
  }, [loginEmail, loginPassword])

  const handleLogout = useCallback((onLogoutTabReset?: () => void) => {
    setIsLoggedIn(false)
    try {
      localStorage.removeItem('qa_auth')
    } catch {}
    if (onLogoutTabReset) onLogoutTabReset()
  }, [])

  useEffect(() => {
    if (!showLogin) return
    const handleClick = (e: MouseEvent) => {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setShowLogin(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showLogin])

  return {
    isLoggedIn,
    showLogin,
    setShowLogin,
    loginEmail,
    setLoginEmail: setLoginEmailClearErr,
    loginPassword,
    setLoginPassword: setLoginPasswordClearErr,
    loginError,
    setLoginError,
    loginLoading,
    loginRef,
    handleLogin,
    handleLogout,
  }
}
