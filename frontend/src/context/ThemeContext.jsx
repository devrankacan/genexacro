import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api from '../api/axios'

const ThemeContext = createContext(null)

/**
 * Calculate relative luminance (WCAG 2.1) from hex color.
 * Returns true if the color is dark (white text needed).
 */
function isDarkColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const toLinear = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance < 0.179
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

function applyTheme(accent, logoUrl, companyName) {
  if (!accent || !/^#[0-9a-fA-F]{6}$/.test(accent)) accent = '#3b82f6'
  const { r, g, b } = hexToRgb(accent)
  const textOnAccent = isDarkColor(accent) ? '#ffffff' : '#111827'

  const root = document.documentElement
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-r', r)
  root.style.setProperty('--accent-g', g)
  root.style.setProperty('--accent-b', b)
  root.style.setProperty('--accent-10', `rgba(${r},${g},${b},0.10)`)
  root.style.setProperty('--accent-20', `rgba(${r},${g},${b},0.20)`)
  root.style.setProperty('--accent-30', `rgba(${r},${g},${b},0.30)`)
  root.style.setProperty('--accent-text', textOnAccent)

  // Persist locally for fast reload
  localStorage.setItem('theme_accent', accent)
  if (logoUrl !== undefined) localStorage.setItem('theme_logo', logoUrl || '')
  if (companyName !== undefined) localStorage.setItem('theme_company', companyName || 'Genexa CRO')
}

export function ThemeProvider({ children }) {
  const [accent, setAccent] = useState(() => localStorage.getItem('theme_accent') || '#3b82f6')
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem('theme_logo') || '')
  const [companyName, setCompanyName] = useState(() => localStorage.getItem('theme_company') || 'Genexa CRO')

  // Apply on mount from localStorage immediately (no flash)
  useEffect(() => {
    applyTheme(accent, logoUrl, companyName)
  }, []) // eslint-disable-line

  // Fetch fresh settings from server
  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/api/settings')
      const newAccent = data.accent_color || '#3b82f6'
      const newLogo = data.logo_url || ''
      const newCompany = data.company_name || 'Genexa CRO'
      setAccent(newAccent)
      setLogoUrl(newLogo)
      setCompanyName(newCompany)
      applyTheme(newAccent, newLogo, newCompany)
    } catch {
      // use cached values
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateTheme = useCallback(async (newAccent, newLogo, newCompanyName) => {
    await api.put('/api/settings/theme', {
      accent_color: newAccent,
      logo_url: newLogo,
      company_name: newCompanyName,
    })
    setAccent(newAccent)
    setLogoUrl(newLogo)
    setCompanyName(newCompanyName)
    applyTheme(newAccent, newLogo, newCompanyName)
  }, [])

  return (
    <ThemeContext.Provider value={{ accent, logoUrl, companyName, updateTheme, fetchSettings }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
