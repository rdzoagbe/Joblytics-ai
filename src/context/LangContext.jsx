import React, { createContext, useContext, useState } from 'react'
import { translations, LANGUAGES } from '../i18n/translations'
import { extraTranslations } from '../i18n/appTranslations'
import { billingTranslations } from '../i18n/billingTranslations'
import { coachTranslations } from '../i18n/coachTranslations'
import { historyTranslations } from '../i18n/historyTranslations'
import { postAnalysisTranslations } from '../i18n/postAnalysisTranslations'
import { legalTranslations } from '../i18n/legalTranslations'
import { productionTranslations } from '../i18n/productionTranslations'
import { remainingPagesTranslations } from '../i18n/remainingPagesTranslations'

const LangContext = createContext({})

const cleanFallbacks = {
  en: {
    cv_optimize_title: 'CV Optimizer',
    cv_optimize_desc: 'Improve your CV using the missing keywords and ATS insights from the selected job analysis.',
    cv_optimize_note: 'Use this after an analysis to make your CV clearer, more targeted and easier for recruiters to scan.',
    cv_optimize_cta: 'Optimize my CV',
    cv_rebuilder_kicker: 'CV Rebuilder',
    cv_rebuilder_title: 'Generate a job-aligned CV draft',
    cv_rebuilder_desc: 'Adapt your current CV with missing keywords, unmet requirements and quick wins from the ATS analysis.',
    downloadable: 'Downloadable',
    cv_source: 'CV source',
    missing_keywords: 'Missing keywords',
    adapted_cv_draft: 'Adapted CV draft',
    not_generated_yet: 'Not generated yet',
    generate_adapted_cv: 'Generate adapted CV draft →'
  },
  fr: {
    cv_optimize_title: 'Optimiseur de CV',
    cv_optimize_desc: 'Améliorez votre CV avec les mots-clés manquants et les indications ATS de l’analyse sélectionnée.',
    cv_optimize_note: 'À utiliser après une analyse pour rendre votre CV plus clair, plus ciblé et plus lisible par les recruteurs.',
    cv_optimize_cta: 'Optimiser mon CV',
    cv_rebuilder_kicker: 'Réécriture CV',
    cv_rebuilder_title: 'Générez un CV aligné avec l’offre',
    cv_rebuilder_desc: 'Adaptez votre CV actuel avec les mots-clés manquants, exigences non couvertes et actions rapides de l’analyse ATS.',
    downloadable: 'Téléchargeable',
    cv_source: 'Source du CV',
    missing_keywords: 'Mots-clés manquants',
    adapted_cv_draft: 'Brouillon CV adapté',
    not_generated_yet: 'Pas encore généré',
    generate_adapted_cv: 'Générer le CV adapté →'
  }
}

function mergeTranslations(base, ...packs) {
  const merged = { ...base }
  packs.forEach(extra => {
    Object.keys(extra || {}).forEach(lang => {
      merged[lang] = { ...(merged[lang] || merged.en || base.en || {}), ...(extra[lang] || {}) }
    })
  })
  return merged
}

const allTranslations = mergeTranslations(translations, extraTranslations, billingTranslations, coachTranslations, historyTranslations, postAnalysisTranslations, legalTranslations, productionTranslations, remainingPagesTranslations, cleanFallbacks)

function formatTemplate(value, params = {}) {
  if (typeof value !== 'string') return value
  return value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`)
}

function humanizeMissingKey(key = '') {
  return String(key || '')
    .replace(/^(nav|btn|cta|cv|ats|ai|ui|profile|messages|smart|sync|billing|contact|legal)_/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('fitscore_lang')
    if (saved && allTranslations[saved]) return saved
    const browser = navigator.language?.split('-')[0]
    if (browser && allTranslations[browser]) return browser
    return 'en'
  })

  const changeLang = (l) => {
    if (!allTranslations[l]) return
    setLang(l)
    localStorage.setItem('fitscore_lang', l)
  }

  const t = (key, paramsOrFallback, fallbackValue) => {
    const hasParams = paramsOrFallback && typeof paramsOrFallback === 'object' && !Array.isArray(paramsOrFallback)
    const params = hasParams ? paramsOrFallback : {}
    const fallback = hasParams ? fallbackValue : paramsOrFallback
    const value = allTranslations[lang]?.[key] || allTranslations.en?.[key] || fallback || humanizeMissingKey(key) || key
    return formatTemplate(value, params)
  }

  return <LangContext.Provider value={{ lang, changeLang, t, languages: LANGUAGES }}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)
