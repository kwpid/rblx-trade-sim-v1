import { createContext, useState, useEffect, useContext } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      verifyToken(token)
    } else {
      setLoading(false)
    }
  }, [])

  const verifyToken = async (token) => {
    try {
      const response = await axios.get('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setUser(response.data.user)
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.banned_until) {
        setUser({
          isBanned: true,
          bannedUntil: error.response.data.banned_until,
          banReason: error.response.data.reason
        });
        // Don't remove token, keeps them "logged in" but banned
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      } else {
        localStorage.removeItem('token')
        delete axios.defaults.headers.common['Authorization']
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async (usernameOrEmail, password) => {
    try {
      const response = await axios.post('/api/auth/login', {
        usernameOrEmail,
        password
      })
      const { token, user } = response.data
      localStorage.setItem('token', token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      return { success: true }
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.banned_until) {
        // Store ban info in user state temporarily to trigger UI
        setUser({
          isBanned: true,
          bannedUntil: error.response.data.banned_until,
          banReason: error.response.data.reason
        });
        return { success: false, error: 'Account Banned' };
      }
      return { success: false, error: error.response?.data?.error || 'Login failed' }
    }
  }

  const register = async (username, email, password) => {
    try {
      const response = await axios.post('/api/auth/register', {
        username,
        email,
        password
      })
      const { token, user } = response.data
      localStorage.setItem('token', token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Registration failed' }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
  }

  const value = {
    user,
    login,
    register,
    logout,
    loading,
    refreshUser: () => verifyToken(localStorage.getItem('token'))
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

