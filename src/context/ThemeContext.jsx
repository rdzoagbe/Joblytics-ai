import React, { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({})

// Premium palette: warm ivory + navy + copper (unified with the landing page and the
// results screen so the whole product reads as one upscale system).
const lightTokens = {
  '--bg': '#FAF7F1',
  '--bg-card': '#FFFDF8',
  '--bg-input': 'rgba(255,255,255,0.72)',
  '--border': 'rgba(16,24,43,0.12)',
  '--border-focus': 'rgba(181,102,60,0.50)',
  '--text-primary': '#10182B',
  '--text-secondary': '#5F6472',
  '--text-muted': '#8A8F9C',
  '--text-hint': '#A6ABB6',
  '--shadow': 'rgba(16,24,43,0.08)',
  '--accent': '#B5663C',
  '--accent-bg': 'rgba(181,102,60,0.10)',
  '--accent-text': '#A85832',
  '--slate': '#10182B',
  '--slate-bg': 'rgba(16,24,43,0.08)',
  '--red': '#B85C55',
  '--amber': '#B9863B',
  '--green': '#557C64',
  '--blue': '#516483'
}

const darkTokens = {
  '--bg': '#0E1420',
  '--bg-card': '#161F2F',
  '--bg-input': 'rgba(255,255,255,0.06)',
  '--border': 'rgba(255,255,255,0.12)',
  '--border-focus': 'rgba(212,146,94,0.55)',
  '--text-primary': '#F4EFE7',
  '--text-secondary': 'rgba(244,239,231,0.76)',
  '--text-muted': 'rgba(244,239,231,0.58)',
  '--text-hint': 'rgba(244,239,231,0.46)',
  '--shadow': 'rgba(0,0,0,0.45)',
  '--accent': '#D4925E',
  '--accent-bg': 'rgba(212,146,94,0.14)',
  '--accent-text': '#E0A876',
  '--slate': '#C9D2E0',
  '--slate-bg': 'rgba(201,210,224,0.10)',
  '--red': '#E0938C',
  '--amber': '#E2B56F',
  '--green': '#8FB89C',
  '--blue': '#9FB2CE'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('fitscore_theme') || 'light')

  const getEffective = (t) => {
    if (t === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    return t
  }

  const [effective, setEffective] = useState(() => getEffective(localStorage.getItem('fitscore_theme') || 'light'))

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => { if (theme === 'system') setEffective(getEffective('system')) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const changeTheme = (t) => {
    setTheme(t)
    localStorage.setItem('fitscore_theme', t)
    setEffective(getEffective(t))
  }

  useEffect(() => {
    const root = document.documentElement
    const tokens = effective === 'dark' ? darkTokens : lightTokens
    Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(key, value))
    root.dataset.theme = effective
  }, [effective])

  return <ThemeContext.Provider value={{ theme, effective, changeTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)