import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api from '../api/axios'

const ThemeContext = createContext(null)

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

function applyAccent(accent) {
  if (!accent || !/^#[0-9a-fA-F]{6}$/.test(accent)) accent = '#dc2626'
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
  localStorage.setItem('theme_accent', accent)
}

function applyMode(mode) {
  if (mode === 'light') {
    document.documentElement.classList.add('light')
  } else {
    document.documentElement.classList.remove('light')
  }
  localStorage.setItem('theme_mode', mode)
}

export function ThemeProvider({ children }) {
  const [accent, setAccent] = useState(() => localStorage.getItem('theme_accent') || '#dc2626')
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem('theme_logo') || '')
  const [companyName, setCompanyName] = useState(() => localStorage.getItem('theme_company') || 'Genexa CRO')
  const [mode, setMode] = useState(() => localStorage.getItem('theme_mode') || 'dark')

  // Apply immediately on mount (no flash)
  useEffect(() => {
    applyAccent(accent)
    applyMode(mode)
  }, []) // eslint-disable-line

  // Fetch fresh settings from server
  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/api/settings')
      const newAccent = data.accent_color || '#dc2626'
      const newLogo = data.logo_url || ''
      const newCompany = data.company_name || 'Genexa CRO'
      setAccent(newAccent)
      setLogoUrl(newLogo)
      setCompanyName(newCompany)
      applyAccent(newAccent)
      localStorage.setItem('theme_logo', newLogo)
      localStorage.setItem('theme_company', newCompany)
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
    applyAccent(newAccent)
    localStorage.setItem('theme_logo', newLogo || '')
    localStorage.setItem('theme_company', newCompanyName || 'Genexa CRO')
  }, [])

  const toggleMode = useCallback(() => {
    const next = mode === 'dark' ? 'light' : 'dark'
    setMode(next)
    applyMode(next)
  }, [mode])

  return (
    <ThemeContext.Provider value={{ accent, logoUrl, companyName, mode, updateTheme, fetchSettings, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
