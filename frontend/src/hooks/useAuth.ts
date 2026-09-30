import { useState, useCallback, useEffect } from 'react'
import axios from 'axios'

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    axios.get('/api/login', { signal: controller.signal }).then(r => setIsLoggedIn(Boolean(r.data.authenticated))).catch(() => {})
    const expired = () => setIsLoggedIn(false)
    window.addEventListener('qa-session-expired', expired)
    return () => { controller.abort(); window.removeEventListener('qa-session-expired', expired) }
  }, [])

  const [showLogin, setShowLogin] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

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

  const handleLogout = useCallback(async (onLogoutTabReset?: () => void) => {
    try {
      await axios.delete('/api/login')
      setIsLoggedIn(false)
      if (onLogoutTabReset) onLogoutTabReset()
    } catch { setLoginError('Could not sign out. Please retry.') }
  }, [])



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
    handleLogin,
    handleLogout,
  }
}
