import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useLang } from '../context/LangContext'
import { useAnalyze } from '../hooks/useAnalyze'
import { useCvPersist } from '../hooks/useCvPersist'
import { useJobUrlHistory } from '../hooks/useJobUrlHistory'
import { sanitizeAnalysisForDisplay } from '../utils/analysisSanitizer'
import { detectLanguage } from '../utils/detectLanguage'
import ResultsView from '../components/ResultsView'
import Confetti from '../components/Confetti'
import PWAInstallPrompt from '../components/PWAInstallPrompt'
import CvPanel from '../components/CvPanel'
import TipCard from '../components/TipCard'
import UpgradePrompt from '../components/UpgradePrompt'
import './AnalyzerPage.css'
import './analyzer-action-hub.css'

const LOADING_MSGS_KEY = ['loading_fetch','loading_cv','loading_ats','loading_score']
const MIN_JOB_TEXT_LENGTH = 450

function readClipperPayload() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('source') !== 'clipper') return null
    return { jobText: params.get('jobText') || '', jobUrl: params.get('jobUrl') || '', title: params.get('jobTitle') || '', company: params.get('company') || '' }
  } catch { return null }
}

const HUB_ICONS = {
  history: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  coach: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  sync: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
}

function AnalyzeShortcut({ icon, title, text, onClick }) {
  return <button type="button" className="analyzeHub-shortcut" onClick={onClick}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{HUB_ICONS[icon] ?? icon}</span><strong>{title}</strong><p>{text}</p></button>
}

export default function AnalyzerPage({ setPage, prefillAnalysis, onClearPrefill }) {
  const { t } = useLang()
  const [jobUrl, setJobUrl] = useState('')
  const [jobText, setJobText] = useState('')
  const [showTextPaste, setShowTextPaste] = useState(false)
  const [userToggledMode, setUserToggledMode] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [msgIdx, setMsgIdx] = useState(0)
  const [uploadTrigger, setUploadTrigger] = useState(0)
  const [clipperInfo, setClipperInfo] = useState(null)
  const intervalRef = useRef(null)
  const resultRef = useRef(null)
  const errorCardRef = useRef(null)
  const { status, data, error, savedRow, rateLimit, planLimit, streamProgress, analyze, reset } = useAnalyze()
  const { cvFile } = useCvPersist()
  const { history: urlHistory } = useJobUrlHistory()
  const [viewingAnalysis, setViewingAnalysis] = useState(prefillAnalysis || null)
  const [showConfetti, setShowConfetti] = useState(false)

  const LOADING_MSGS = LOADING_MSGS_KEY.map(k => t(k))
  const isLimitError = status === 'error' && /limit|upgrade/i.test(String(error || ''))

  const normalizeJobUrl = value => {
    const withoutHiddenChars = String(value || '').replace(/[\u200b-\u200d\ufeff]/g, '')
    const trimmed = withoutHiddenChars.trim()
    if (!trimmed) return ''
    const compactUrl = trimmed.replace(/\s+/g, '')
    const candidate = /^(https?:\/\/|www\.)/i.test(trimmed) ? compactUrl : trimmed
    if (/^https?:\/\//i.test(candidate)) return candidate
    if (/^www\./i.test(candidate)) return `https://${candidate}`
    if (candidate.includes('.') && !candidate.includes(' ')) return `https://${candidate}`
    return trimmed
  }

  const isValidUrl = str => { try { const u = new URL(normalizeJobUrl(str)); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false } }
  const isLikelyJobDescription = value => { const text = String(value || '').trim(); if (text.length < MIN_JOB_TEXT_LENGTH) return false; if (isValidUrl(text)) return false; return /\s/.test(text) }
  const detectRestrictedJobBoard = url => {
    if (!isValidUrl(url)) return null
    const lower = normalizeJobUrl(url).toLowerCase()
    if (lower.includes('linkedin.com')) return 'LinkedIn'
    if (lower.includes('indeed.')) return 'Indeed'
    if (lower.includes('glassdoor.')) return 'Glassdoor'
    if (lower.includes('welcometothejungle.com')) return 'Welcome to the Jungle'
    if (lower.includes('builtin.com') || lower.includes('built-in.com')) return 'Built In'
    if (lower.includes('workday')) return 'Workday'
    if (lower.includes('greenhouse.io')) return 'Greenhouse'
    if (lower.includes('lever.co')) return 'Lever'
    if (lower.includes('smartrecruiters.com')) return 'SmartRecruiters'
    return null
  }

  const normalizedJobUrl = normalizeJobUrl(jobUrl)
  const restrictedJobBoard = detectRestrictedJobBoard(jobUrl)
  const isLinkedInUrl = isValidUrl(jobUrl) && normalizedJobUrl.toLowerCase().includes('linkedin.com')
  const isUrlModeLinkedIn = false
  const canAnalyzeUrl = !showTextPaste && isValidUrl(jobUrl)
  const canAnalyzePaste = showTextPaste && jobText.trim().length >= MIN_JOB_TEXT_LENGTH
  const canAnalyze = status !== 'loading' && !!cvFile && (canAnalyzePaste || canAnalyzeUrl || isUrlModeLinkedIn)
  const pasteProgress = Math.min(100, Math.round((jobText.trim().length / MIN_JOB_TEXT_LENGTH) * 100))
  const jobTextLanguage = showTextPaste && jobText.trim().length >= 200 ? detectLanguage(jobText) : null

  useEffect(() => {
    const payload = readClipperPayload()
    if (!payload) return
    setClipperInfo(payload)
    if (payload.jobText && payload.jobText.trim().length >= MIN_JOB_TEXT_LENGTH) { setJobText(payload.jobText); setShowTextPaste(true); setUserToggledMode(false) }
    else if (payload.jobUrl) { setJobUrl(normalizeJobUrl(payload.jobUrl)); setShowTextPaste(false); setUserToggledMode(false) }
    window.history.replaceState({ page: 'analyzer' }, '', '/analyzer')
  }, [])

  const switchToPasteMode = () => { setShowTextPaste(true); setUserToggledMode(true) }
  const handleUrlChange = e => { const value = e.target.value; if (isLikelyJobDescription(value)) { setJobText(value); setJobUrl(''); setShowTextPaste(true); setUserToggledMode(false); return } setJobUrl(value) }
  const handlePasteTextChange = e => { const value = e.target.value; if (isValidUrl(value)) { setJobUrl(normalizeJobUrl(value)); setJobText(''); setShowTextPaste(false); setUserToggledMode(false); return } setJobText(value) }

  const handleAnalyze = async () => {
    if (!cvFile) return
    if (isUrlModeLinkedIn) {
      switchToPasteMode()
      return
    }
    setViewingAnalysis(null)
    intervalRef.current = setInterval(() => setMsgIdx(i => (i + 1) % LOADING_MSGS.length), 1800)
    if (canAnalyzePaste) await analyze(isValidUrl(jobUrl) ? normalizedJobUrl : null, cvFile, jobText.trim())
    else if (canAnalyzeUrl) await analyze(normalizedJobUrl, cvFile)
    clearInterval(intervalRef.current)
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const handleReset = useCallback(() => { reset(); setViewingAnalysis(null); setJobUrl(''); setJobText(''); setShowTextPaste(false); setUserToggledMode(false); setMsgIdx(0); setClipperInfo(null); onClearPrefill?.() }, [reset, onClearPrefill])
  useEffect(() => { if (prefillAnalysis) { setViewingAnalysis(prefillAnalysis); setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) } }, [prefillAnalysis])
  useEffect(() => { if (status === 'done' && data?.display_score >= 70) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2600) } }, [status, data])
  useEffect(() => { if (status === 'error') { setTimeout(() => errorCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150) } }, [status])

  const rawDisplayData = viewingAnalysis?.result || data
  const displayData = rawDisplayData ? sanitizeAnalysisForDisplay(rawDisplayData) : rawDisplayData
  const displayStatus = viewingAnalysis ? 'done' : status

  return (
    <div className="analyzePro-page">
      {showConfetti && <Confetti />}
      <main className="analyzePro-shell">
        {displayStatus !== 'done' && <>
          <div className="analyzePro-pageHero"><p className="analyzePro-kicker">{t('analyzer_kicker')}</p><h1>{t('analyzer_title')}</h1><p>{t('analyzer_subtitle')}</p></div>
          <div className="analyzePro-layout">
            <section className="analyzePro-card">
              {clipperInfo && <TipCard type="success" title={t('az_clipped_title', 'Job clipped from browser')} body={`${clipperInfo.title || t('az_job_word', 'Job')}${clipperInfo.company ? `${t('az_at_word', ' at ')}${clipperInfo.company}` : ''}${t('az_clipped_body_suffix', ' was imported into the analyzer. Upload or confirm your CV, then run the match.')}`} />}
              <p className="analyzePro-sectionLabel">{t('az_your_cv', 'Your CV')}</p><CvPanel uploadTrigger={uploadTrigger} />
              <div ref={errorCardRef} className="analyzePro-jobSection">
                <p className="analyzePro-sectionLabel">{t('az_job_listing', 'Job listing')}</p>
                <div className="analyzePro-modeTabs"><button type="button" className={`analyzePro-modeTab${!showTextPaste ? ' is-active' : ''}`} onClick={() => { setShowTextPaste(false); setUserToggledMode(true) }}>{t('analyzer_url_mode')}</button><button type="button" className={`analyzePro-modeTab${showTextPaste ? ' is-active' : ''}`} onClick={() => { setShowTextPaste(true); setUserToggledMode(true) }}>{t('az_accurate_paste_mode', 'Accurate paste mode')}</button></div>
                {!showTextPaste ? <>
                  {isLinkedInUrl ? <TipCard type="warning" title={t('az_linkedin_title', 'LinkedIn needs Accurate paste mode')} body={t('az_linkedin_body', 'LinkedIn does not reliably expose the full job description to URL readers. To avoid misleading scores, click the button below, paste the full LinkedIn job description, then run the ATS check.')} /> : restrictedJobBoard ? <TipCard type="warning" title={`${restrictedJobBoard}${t('az_board_block_title_suffix', ' may block URL extraction')}`} body={`${restrictedJobBoard}${t('az_board_block_body_suffix', ' can hide the full job description behind access controls. If the score looks incomplete, paste the full job description instead.')}`} /> : <TipCard type="info" title={t('az_url_quick_title', 'URL mode is quick')} body={t('az_url_quick_body', 'Paste a public job URL and Joblytics will try to extract the job description. For best accuracy, use Accurate paste mode with the full description.')} />}
                  <input type="text" inputMode="url" value={jobUrl} onChange={handleUrlChange} onBlur={() => setJobUrl(value => normalizeJobUrl(value))} placeholder={t('analyzer_url_placeholder')} />
                  {jobUrl.trim() && !isValidUrl(jobUrl) && <TipCard type="warning" title={t('analyzer_link_invalid_title')} body={t('analyzer_link_invalid_body')} />}
                  {isLinkedInUrl && <TipCard type="info" title={t('az_linkedin_paste_title', 'What to paste from LinkedIn')} body={t('az_linkedin_paste_body', 'Copy the job title, company context, responsibilities, required skills, experience level, languages and location. Then use Accurate paste mode.')} />}
                  {restrictedJobBoard && <button type="button" onClick={switchToPasteMode} style={{ width: '100%', marginTop: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 900, cursor: 'pointer' }}>{t('az_use_accurate_paste_mode', 'Use Accurate paste mode')}</button>}
                  {urlHistory.length > 0 && <div style={{ marginTop: 10 }}><button type="button" onClick={() => setShowHistory(v => !v)} style={{ background: 'transparent', border: 0, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>{t('analyzer_recent_links')}</button>{showHistory && <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{urlHistory.slice(0,5).map(url => <button key={url} type="button" onClick={() => { setJobUrl(normalizeJobUrl(url)); setJobText(''); setShowTextPaste(false); setShowHistory(false) }} style={{ textAlign: 'left', padding: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</button>)}</div>}</div>}
                </> : <>
                  <TipCard type="success" title={t('az_recommended_title', 'Recommended for accurate scoring')} body={t('az_recommended_body', 'Paste the full job description, especially the mission, responsibilities, requirements, skills, experience level and language requirements. This gives the ATS engine enough evidence to calculate a trustworthy score.')} />
                  <textarea value={jobText} onChange={handlePasteTextChange} placeholder={t('az_paste_placeholder', 'Paste the complete job description here: company context, role mission, responsibilities, required skills, experience level, languages and location.')} rows={10} />
                  {jobText.trim().length > 0 && !canAnalyzePaste && <TipCard type="warning" title={t('az_add_more_title', 'Add more of the job description')} body={`${t('az_add_more_body_pre', 'For a reliable ATS score, paste at least ')}${MIN_JOB_TEXT_LENGTH}${t('az_add_more_body_mid', ' characters. Current progress: ')}${pasteProgress}${t('az_add_more_body_suf', '%. Include responsibilities, requirements and skills.')}`} />}
                  {jobTextLanguage?.code !== 'unknown' && jobTextLanguage?.label && <TipCard type="info" title={`${t('az_job_lang_title_pre', "This job offer looks like it's written in ")}${jobTextLanguage.label}`} body={`${t('az_job_lang_body_pre', 'For the most accurate ATS score, make sure the CV selected above is also written in ')}${jobTextLanguage.label}${t('az_job_lang_body_mid', '. If not, add a ')}${jobTextLanguage.label}${t('az_job_lang_body_suf', ' version of your CV before running the analysis.')}`} />}
                </>}
                {planLimit?.plan === 'free' && planLimit?.limit > 0 && <p style={{ fontSize: 12, color: planLimit.used >= planLimit.limit - 1 ? 'var(--accent)' : 'var(--text-secondary)', textAlign: 'center', margin: '8px 0 0' }}>{planLimit.used} / {planLimit.limit} {t('analyzer_analyses_used', 'analyses used this month')}</p>}
                {isLimitError && <UpgradePrompt title={t('upgrade_analyze_title')} body={t('upgrade_analyze_body')} onUpgrade={() => setPage('billing')} />}
                {status === 'error' && !isLimitError && <TipCard type="error" title={t('analyzer_failed')} body={error} />}
                {status === 'error' && !isLimitError && !showTextPaste && <button type="button" onClick={switchToPasteMode} style={{ width: '100%', marginTop: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 900, cursor: 'pointer' }}>{t('az_switch_to_accurate_paste_mode', 'Switch to Accurate paste mode')}</button>}
                {status === 'loading' && <div style={{ marginTop: 12 }}><p style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 13 }}>{LOADING_MSGS[msgIdx]}</p>{streamProgress > 0 && <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${streamProgress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.4s ease' }} /></div>}</div>}
                <button className="btn-primary" onClick={handleAnalyze} disabled={status === 'loading' || !canAnalyze} style={{ width: '100%', marginTop: 14 }}>{isUrlModeLinkedIn ? t('az_switch_to_accurate_paste_mode', 'Switch to Accurate paste mode') : status === 'loading' ? t('analyzer_analyzing') : t('analyzer_analyze_match')}</button>
              </div>
            </section>
            <aside className="analyzePro-side analyzeHub-side">
              <div className="analyzePro-sideCard analyzeHub-card"><p className="analyzePro-kicker">{t('az_action_hub', 'Action hub')}</p><h3>{t('az_action_hub_title', 'After analysis, move faster')}</h3><p>{t('az_action_hub_desc', 'Use these shortcuts to continue the workflow without returning to the Dashboard.')}</p><div className="analyzeHub-shortcuts"><AnalyzeShortcut icon="history" title={t('az_shortcut_history_title', 'History')} text={t('az_shortcut_history_text', 'Review saved analyses in the compact table.')} onClick={() => setPage('history')} /><AnalyzeShortcut icon="coach" title={t('az_shortcut_coach_title', 'CV Coach')} text={t('az_shortcut_coach_text', 'Generate cover letters and recruiter messages.')} onClick={() => setPage('coach')} /><AnalyzeShortcut icon="sync" title={t('az_shortcut_sync_title', 'Smart Sync')} text={t('az_shortcut_sync_text', 'Track recruiter replies and interviews.')} onClick={() => setPage('messages')} /></div></div>
              <div className="analyzePro-sideCard"><p className="analyzePro-kicker">{t('analyzer_workflow')}</p><h3>{t('analyzer_workflow_title')}</h3><div className="analyzePro-steps"><div className="analyzePro-step"><span>1</span><div><strong>{t('analyzer_step1_title')}</strong><small>{t('analyzer_step1_body')}</small></div></div><div className="analyzePro-step"><span>2</span><div><strong>{t('analyzer_step2_title')}</strong><small>{t('analyzer_step2_body')}</small></div></div><div className="analyzePro-step"><span>3</span><div><strong>{t('analyzer_step3_title')}</strong><small>{t('analyzer_step3_body')}</small></div></div></div></div>
              <div className="analyzePro-sideCard"><p className="analyzePro-kicker">{t('analyzer_tip')}</p><h3>{t('analyzer_tip_title')}</h3><p>{t('analyzer_tip_body')}</p></div>
            </aside>
          </div>
        </>}
        {displayStatus === 'done' && displayData && <div ref={resultRef} className="page-enter"><ResultsView data={displayData} savedRow={viewingAnalysis ? viewingAnalysis : savedRow} rateLimit={rateLimit} onReset={handleReset} onGoCoach={() => setPage('coach')} /></div>}
      </main>
      <PWAInstallPrompt />
    </div>
  )
}
