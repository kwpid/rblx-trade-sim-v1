// Date formatting utilities to ensure consistent timezone handling

/**
 * Format a date string to local timezone
 * @param {string|Date} dateString - ISO date string or Date object
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string in user's local timezone
 */
export const formatLocalDate = (dateString, options = {}) => {
  if (!dateString) return 'Unknown'

  const date = new Date(dateString)

  // Ensure we have a valid date
  if (isNaN(date.getTime())) return 'Invalid Date'

  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  }

  return date.toLocaleString(undefined, defaultOptions)
}

/**
 * Format a date string to local time only
 * @param {string|Date} dateString - ISO date string or Date object
 * @returns {string} Time string in user's local timezone
 */
export const formatLocalTime = (dateString) => {
  return formatLocalDate(dateString, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Format a date string to local date only
 * @param {string|Date} dateString - ISO date string or Date object
 * @returns {string} Date string in user's local timezone
 */
export const formatLocalDateOnly = (dateString) => {
  return formatLocalDate(dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Get relative time (e.g., "2 hours ago")
 * @param {string|Date} dateString - ISO date string or Date object
 * @returns {string} Relative time string
 */
export const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Unknown'

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`

  return formatLocalDate(dateString, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}