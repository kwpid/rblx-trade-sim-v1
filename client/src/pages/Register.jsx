import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Auth.css'

const Register = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const validateUsername = (username) => {
    // Only allow letters, numbers, and one underscore
    const usernameRegex = /^[a-zA-Z0-9]_?[a-zA-Z0-9]*$|^[a-zA-Z0-9]+$/
    
    // Check if username contains only allowed characters
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { valid: false, error: 'Username can only contain letters, numbers, and one underscore' }
    }
    
    // Check if there's more than one underscore
    const underscoreCount = (username.match(/_/g) || []).length
    if (underscoreCount > 1) {
      return { valid: false, error: 'Username can only contain one underscore' }
    }
    
    // Check if username starts or ends with underscore
    if (username.startsWith('_') || username.endsWith('_')) {
      return { valid: false, error: 'Username cannot start or end with an underscore' }
    }
    
    // Check minimum length
    if (username.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters' }
    }
    
    // Check maximum length
    if (username.length > 20) {
      return { valid: false, error: 'Username must be 20 characters or less' }
    }
    
    return { valid: true }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validate username
    const usernameValidation = validateUsername(username)
    if (!usernameValidation.valid) {
      setError(usernameValidation.error)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    const result = await register(username, email, password)
    
    if (result.success) {
      navigate('/catalog')
    } else {
      setError(result.error)
    }
    
    setLoading(false)
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Create Account</h1>
        <p className="auth-subtitle">Join the trading community</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="Choose a username"
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Create a password"
              required
            />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              placeholder="Confirm your password"
              required
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>
        <p className="auth-link">
          Already have an account? <Link to="/login">Log In</Link>
        </p>
      </div>
    </div>
  )
}

export default Register
