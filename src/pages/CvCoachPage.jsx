import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUserProfile } from '../hooks/useUserProfile'
import { OptimizeCvPanel } from '../components/OptimizeCvCard'
import CommunicationAssetsCard from '../components/CommunicationAssetsCard'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'

const theme = {
  ivory: 'var(--bg)',
  paper: 'var(--bg-card)',
  navy: 'var(--text-primary)',
  muted: 'var(--text-secondary)',
  line: 'var(--border)',
  copper: 'var(--accent)',
  copperSoft: 'var(--accent-bg)',
  green: '#557C64',
  red: '#B85C55',
  gold: '#B9863B'
}

function card(extra = {}) {
  return { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, boxShadow: '0 20px 55px rgba(16,24,43,0.09)', ...extra }
}

function Kicker({ children }) {
  return <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 950, letterSpacing: '0.13em', textTransform: 'uppercase', color: theme.copper }}>{children}</p>
}

function QuickWinCard({ win, index, t }) {
  const [copiedTip, setCopiedTip] = useState(false)
  const [copiedExample, setCopiedExample] = useState(false)
  const tip = typeof win === 'string' ? win : win?.tip || ''
  const example = typeof win === 'object' ? win?.example : null

  return (
    <div style={{ ...card({ borderRadius: 16, padding: '13px 15px', boxShadow: 'none' }), display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: theme.copperSoft, border: `1px solid rgba(181,102,60,0.28)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: theme.copper }}>{index + 1}</span>
        </div>
        <p style={{ fontSize: 13, color: theme.navy, lineHeight: 1.6, flex: 1, margin: 0, fontWeight: example ? 750 : 500 }}>{tip}</p>
        {!example && (
          <button onClick={() => { navigator.clipboard.writeText(tip); setCopiedTip(true); setTimeout(() => setCopiedTip(false), 1500) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: copiedTip ? theme.green : theme.muted, flexShrink: 0, padding: '2px 4px' }}>
            {copiedTip ? '✓' : '📋'}
          </button>
        )}
      </div>
      {example && (
        <div style={{ background: 'var(--bg-input)', borderLeft: `3px solid ${theme.copper}`, borderRadius: 10, padding: '9px 11px', marginLeft: 38 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: theme.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Example</span>
            <button onClick={() => { navigator.clipboard.writeText(example); setCopiedExample(true); setTimeout(() => setCopiedExample(false), 1500) }}
              style={{ background: copiedExample ? 'rgba(85,124,100,0.15)' : theme.paper, border: `1px solid ${copiedExample ? 'rgba(85,124,100,0.3)' : theme.line}`, borderRadius: 14, padding: '2px 8px', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: copiedExample ? theme.green : theme.muted, fontFamily: 'inherit' }}>
              {copiedExample ? `✓ ${t('copied')}` : `📋 ${t('copy')}`}
            </button>
          </div>
          <p style={{ fontSize: 12, color: theme.muted, lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>"{example}"</p>
        </div>
      )}
    </div>
  )
}

function MissingKeywordChip({ word }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(word); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      style={{ padding: '6px 12px', borderRadius: 20, background: copied ? 'rgba(85,124,100,0.15)' : 'rgba(184,92,85,0.09)', border: `1px solid ${copied ? 'rgba(85,124,100,0.3)' : 'rgba(184,92,85,0.22)'}`, color: copied ? theme.green : theme.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800 }}>
      {copied ? '✓' : '+'} {word}
    </button>
  )
}

function AnalysisCoach({ analysis, t }) {
  const r = analysis.result
  if (!r) return null
  const qw = r.quick_wins || []
  const missing = r.keyword_match?.missing_required || []
  const gaps = r.critical_gaps || []
  const edges = r.interview_prep?.your_edges || []
  const scoreColor = analysis.score >= 70 ? theme.green : analysis.score >= 50 ? theme.gold : theme.red

  return (
    <div style={{ ...card({ overflow: 'hidden' }) }}>
      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${theme.line}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, border: `2px solid ${scoreColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${scoreColor}18` }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: scoreColor, fontFamily: 'Georgia, serif' }}>{analysis.score}%</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Kicker>{t('coach_kicker')}</Kicker>
          <p style={{ fontSize: 17, fontWeight: 500, color: theme.navy, fontFamily: 'Georgia, Newsreader, serif', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.04em' }}>
            {r.job_context?.title || analysis.job_title || 'Analysis'}
          </p>
          {r.job_context?.company && r.job_context.company !== 'Not specified' &&
            <p style={{ fontSize: 12, color: theme.copper, fontWeight: 800, margin: '2px 0 0' }}>@ {r.job_context.company}</p>}
        </div>
      </div>

      <div style={{ padding: '18px 20px', display: 'grid', gap: 20 }}>
        {qw.length > 0 && (
          <div>
            <Kicker>✏️ {t('quick_wins')} — {t('coach_add_hint')}</Kicker>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{qw.map((w, i) => <QuickWinCard key={i} win={w} index={i} t={t} />)}</div>
          </div>
        )}
        {missing.length > 0 && (
          <div>
            <Kicker>🏷️ {t('missing')} {t('keywords')} — {t('coach_keyword_hint')}</Kicker>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>{missing.map(w => <MissingKeywordChip key={w} word={w} />)}</div>
          </div>
        )}
        {edges.length > 0 && (
          <div>
            <Kicker>💪 {t('your_edges')}</Kicker>
            <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
              {edges.map((e, i) => <div key={i} style={{ padding: '10px 13px', background: 'rgba(85,124,100,0.08)', borderRadius: 13, borderLeft: `3px solid ${theme.green}`, fontSize: 13, color: theme.muted, lineHeight: 1.5 }}>✓ {e}</div>)}
            </div>
          </div>
        )}
        {gaps.length > 0 && (
          <div>
            <Kicker>⚠️ {t('gaps')} — {t('coach_gaps_hint')}</Kicker>
            <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
              {gaps.map((g, i) => <div key={i} style={{ padding: '10px 13px', background: 'rgba(184,92,85,0.07)', borderRadius: 13, borderLeft: `3px solid ${theme.red}`, fontSize: 13, color: theme.muted, lineHeight: 1.5 }}>✗ {g}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CoverLetterPanel({ selected, t, lang, fullName, saveFullName }) {
  const [coverLetter, setCoverLetter] = useState('')
  const [tone, setTone] = useState('professional')
  const [length, setLength] = useState('standard')
  const [genError, setGenError] = useState('')
  const [recipient, setRecipient] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [tempName, setTempName] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedLetters, setSavedLetters] = useState(() => {
    try { return JSON.parse(localStorage.getItem('joblytics_cover_letters') || '[]') } catch { return [] }
  })

  useEffect(() => {
    setRecipient(selected?.result?.job_context?.hiring_contact || '')
    setCoverLetter('')
    setGenError('')
  }, [selected?.id])

  const autoSaveLetter = (letter) => {
    const jobTitle = selected?.result?.job_context?.title || selected?.job_title || 'Job'
    const entry = {
      id: `${selected?.id || 'x'}_${Date.now()}`,
      jobId: selected?.id || null,
      jobTitle,
      letter,
      tone,
      length,
      savedAt: new Date().toISOString()
    }
    const updated = [entry, ...savedLetters.filter(l => l.jobId !== selected?.id)].slice(0, 10)
    setSavedLetters(updated)
    try { localStorage.setItem('joblytics_cover_letters', JSON.stringify(updated)) } catch {}
  }

  const deleteSavedLetter = (id) => {
    const updated = savedLetters.filter(l => l.id !== id)
    setSavedLetters(updated)
    try { localStorage.setItem('joblytics_cover_letters', JSON.stringify(updated)) } catch {}
  }

  const generate = async () => {
    if (!selected?.result) return
    setGenLoading(true)
    setCoverLetter('')
    try {
      let nameToUse = fullName
      if (!nameToUse && tempName?.trim()) {
        const r = await saveFullName(tempName.trim())
        if (r?.success) { nameToUse = tempName.trim(); setEditingName(false) }
        else { setGenError(r?.error || 'Could not save your name.'); setGenLoading(false); return }
      }
      if (!nameToUse) { setEditingName(true); setGenError(t('name_required_first')); setGenLoading(false); return }

      const token = (await supabase.auth.getSession()).data?.session?.access_token
      const res = await fetch('/api/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ analysis: selected.result, lang, tone, length, recipient: recipient.trim() || null, fullName: nameToUse })
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Error ${res.status}`) }
      const data = await res.json()
      setCoverLetter(data.letter || '')
      if (data.letter) autoSaveLetter(data.letter)
    } catch (e) {
      setCoverLetter('')
      setGenError(e.message || 'Could not generate cover letter.')
    }
    setGenLoading(false)
  }

  const copyLetter = () => { navigator.clipboard.writeText(coverLetter); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${theme.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <Kicker>{t('cover_letter_desc')}</Kicker>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 500, color: theme.navy, fontFamily: 'Georgia, Newsreader, serif', letterSpacing: '-0.04em' }}>✉️ {t('cover_letter')}</p>
        </div>
        {coverLetter && (
          <button onClick={copyLetter} style={{ padding: '8px 14px', borderRadius: 999, background: copied ? 'rgba(85,124,100,0.15)' : 'var(--bg-input)', border: `1px solid ${copied ? 'rgba(85,124,100,0.3)' : theme.line}`, color: copied ? theme.green : theme.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800 }}>
            {copied ? `✓ ${t('copied')}` : `📋 ${t('copy')}`}
          </button>
        )}
      </div>

      <div style={{ padding: '18px 20px' }}>
        {!coverLetter && !genLoading && (
          <div style={{ display: 'grid', gap: 14 }}>
            {savedLetters.length > 0 && (
              <div style={{ borderRadius: 16, border: `1px solid ${theme.line}`, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: 'var(--bg-input)', borderBottom: `1px solid ${theme.line}` }}>
                  <Kicker>Previous letters</Kicker>
                </div>
                <div style={{ display: 'grid', gap: 0 }}>
                  {savedLetters.slice(0, 4).map((l, i) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < Math.min(savedLetters.length, 4) - 1 ? `1px solid ${theme.line}` : 'none' }}>
                      <button onClick={() => setCoverLetter(l.letter)}
                        style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: theme.navy, display: 'block' }}>{l.jobTitle}</span>
                        <span style={{ fontSize: 10, color: theme.muted }}>
                          {l.tone} · {l.length} · {new Date(l.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </button>
                      <button onClick={() => deleteSavedLetter(l.id)}
                        style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer', fontSize: 14, padding: '2px 4px', lineHeight: 1 }}
                        title="Remove">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p style={{ fontSize: 13, color: theme.muted, lineHeight: 1.6, textAlign: 'center', margin: 0 }}>✉️ {t('cover_letter_prompt')}</p>

            {/* Name */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <Kicker>{t('your_name')}</Kicker>
                {!editingName && fullName && <button onClick={() => { setEditingName(true); setTempName(fullName) }} style={{ fontSize: 10, color: theme.copper, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{t('edit')}</button>}
              </div>
              {editingName ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" value={tempName} onChange={e => setTempName(e.target.value)} placeholder={t('your_name_placeholder')}
                    style={{ flex: 1, padding: '10px 13px', fontSize: 13, background: 'var(--bg-input)', border: `1px solid ${theme.line}`, borderRadius: 13, color: theme.navy, outline: 'none' }}
                    autoFocus
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && tempName.trim()) { const r = await saveFullName(tempName); if (r?.success) { setEditingName(false); setGenError('') } }
                      if (e.key === 'Escape') setEditingName(false)
                    }} />
                  <button onClick={async () => { if (!tempName.trim()) return; const r = await saveFullName(tempName); if (r?.success) { setEditingName(false); setGenError('') } }}
                    disabled={!tempName.trim()}
                    style={{ padding: '10px 14px', borderRadius: 13, background: tempName.trim() ? theme.navy : 'var(--bg-input)', border: tempName.trim() ? 'none' : `1px solid ${theme.line}`, color: tempName.trim() ? theme.ivory : theme.muted, fontSize: 12, fontWeight: 800, cursor: tempName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                    {t('save')}
                  </button>
                </div>
              ) : (
                <div onClick={() => { setEditingName(true); setTempName(fullName || '') }}
                  style={{ padding: '10px 13px', background: 'var(--bg-input)', border: `1px solid ${theme.line}`, borderRadius: 13, fontSize: 13, color: fullName ? theme.navy : theme.muted, cursor: 'pointer' }}>
                  {fullName || t('your_name_hint')}
                </div>
              )}
            </div>

            {/* Recipient */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <Kicker>{t('recipient_label')}</Kicker>
                <span style={{ fontSize: 9, color: theme.muted, fontWeight: 500 }}>· {t('optional')}</span>
              </div>
              <input type="text" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder={t('recipient_placeholder')}
                style={{ width: '100%', padding: '10px 13px', fontSize: 13, background: 'var(--bg-input)', border: `1px solid ${theme.line}`, borderRadius: 13, color: theme.navy, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Tone */}
            <div>
              <Kicker style={{ marginBottom: 8 }}>{t('cover_letter_tone')}</Kicker>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7, marginTop: 7 }}>
                {[{ v: 'professional', label: t('tone_professional') }, { v: 'warm', label: t('tone_warm') }, { v: 'formal', label: t('tone_formal') }, { v: 'enthusiastic', label: t('tone_enthusiastic') }].map(o => (
                  <button key={o.v} onClick={() => setTone(o.v)}
                    style={{ padding: '10px', borderRadius: 13, border: `1.5px solid ${tone === o.v ? theme.navy : theme.line}`, background: tone === o.v ? theme.navy : 'var(--bg-input)', color: tone === o.v ? theme.ivory : theme.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, transition: 'all 0.12s' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Length */}
            <div>
              <Kicker style={{ marginBottom: 8 }}>{t('cover_letter_length')}</Kicker>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginTop: 7 }}>
                {[{ v: 'short', label: t('length_short'), sub: t('length_short_sub') }, { v: 'standard', label: t('length_standard'), sub: t('length_standard_sub') }, { v: 'detailed', label: t('length_detailed'), sub: t('length_detailed_sub') }].map(o => (
                  <button key={o.v} onClick={() => setLength(o.v)}
                    style={{ padding: '10px 6px', borderRadius: 13, border: `1.5px solid ${length === o.v ? theme.navy : theme.line}`, background: length === o.v ? theme.navy : 'var(--bg-input)', color: length === o.v ? theme.ivory : theme.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', transition: 'all 0.12s' }}>
                    <span>{o.label}</span>
                    <span style={{ fontSize: 9, color: length === o.v ? 'rgba(250,247,241,0.76)' : 'rgba(95,100,114,0.72)', fontWeight: 500 }}>{o.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {genError && <p style={{ fontSize: 12, color: theme.red, margin: 0, padding: '10px 13px', background: 'rgba(184,92,85,0.08)', border: '1px solid rgba(184,92,85,0.25)', borderRadius: 13 }}>⚠ {genError}</p>}

            <button onClick={() => { setGenError(''); generate() }} disabled={!selected}
              style={{ width: '100%', minHeight: 48, borderRadius: 999, border: 0, background: theme.navy, color: theme.ivory, fontWeight: 900, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
              {t('generate_letter')}
            </button>
          </div>
        )}

        {genLoading && (
          <div style={{ textAlign: 'center', padding: '40px 16px' }}>
            <div style={{ width: 28, height: 28, border: `2px solid ${theme.line}`, borderTop: `2px solid ${theme.copper}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, color: theme.muted }}>{t('generating')}</p>
          </div>
        )}

        {coverLetter && (
          <div>
            <pre style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: theme.navy, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, background: 'var(--bg-input)', borderRadius: 14, padding: '16px 17px', maxHeight: 440, overflowY: 'auto', border: `1px solid ${theme.line}` }}>{coverLetter}</pre>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <button onClick={copyLetter} style={{ padding: '12px', borderRadius: 13, background: copied ? 'rgba(85,124,100,0.15)' : theme.navy, border: copied ? '1px solid rgba(85,124,100,0.3)' : 'none', color: copied ? theme.green : theme.ivory, fontSize: 12, cursor: 'pointer', fontWeight: 800, fontFamily: 'inherit' }}>
                {copied ? `✓ ${t('copied')}` : `📋 ${t('copy')}`}
              </button>
              <button onClick={() => { setGenError(''); generate() }} style={{ padding: '12px', borderRadius: 13, background: 'var(--bg-input)', border: `1px solid ${theme.line}`, color: theme.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800 }}>
                ↺ {t('regenerate')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const TABS = [
  { id: 'letter', icon: '✉️', label: 'Cover Letter' },
  { id: 'messages', icon: '💬', label: 'Messages' },
  { id: 'cv', icon: '📝', label: 'CV Optimize' }
]

export default function CvCoachPage({ setPage }) {
  const { user, session } = useAuth()
  const { t, lang } = useLang()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [activeTab, setActiveTab] = useState('letter')
  const { fullName, saveFullName } = useUserProfile()

  useEffect(() => { if (user?.id) fetchAnalyses() }, [user?.id])

  const fetchAnalyses = async () => {
    const { data } = await supabase.from('analyses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
    setAnalyses(data || [])
    if (data?.length > 0) setSelected(data[0])
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: 'clamp(20px,4vw,36px) clamp(16px,5vw,48px)', maxWidth: 900, margin: '0 auto' }}>
      {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 200, marginBottom: 12, borderRadius: 20 }} />)}
    </div>
  )

  if (analyses.length === 0) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: 'clamp(20px,4vw,36px) clamp(16px,5vw,48px)', maxWidth: 900, margin: '0 auto', textAlign: 'center', paddingTop: 80 }}>
      <div style={{ ...card({ padding: 34 }) }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
        <h2 style={{ fontFamily: 'Georgia, Newsreader, serif', fontSize: 34, color: theme.navy, marginBottom: 8, fontWeight: 500, letterSpacing: '-0.06em' }}>{t('no_analyses', 'No analyses yet')}</h2>
        <p style={{ fontSize: 14, color: theme.muted, marginBottom: 24, lineHeight: 1.6 }}>CV Coach generates cover letters and messages based on a job analysis. Run a job analysis first, then come back here to generate your assets.</p>
        <button
          type="button"
          onClick={() => setPage?.('analyzer')}
          style={{ minHeight: 44, padding: '0 24px', borderRadius: 999, border: 0, background: theme.navy, color: theme.ivory, fontWeight: 900, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}
        >
          Analyze a job first →
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 16% 8%, rgba(181,102,60,0.12), transparent 34%), var(--bg)', padding: 'clamp(20px,4vw,38px) clamp(16px,5vw,48px) 90px' }}>
      <main style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Hero */}
        <div style={{ ...card({ padding: 'clamp(22px,3.5vw,38px)', marginBottom: 22, borderRadius: 28 }) }}>
          <Kicker>{t('coach_kicker')}</Kicker>
          <h1 style={{ fontFamily: 'Georgia, Newsreader, serif', fontSize: 'clamp(38px,5.5vw,64px)', fontWeight: 500, color: theme.navy, margin: '8px 0 0', letterSpacing: '-0.07em', lineHeight: 0.95 }}>
            {t('coach_title')}
          </h1>
          <p style={{ fontSize: 14, color: theme.muted, lineHeight: 1.7, maxWidth: 680, margin: '12px 0 0' }}>
            {t('coach_subtitle')}
          </p>
        </div>

        {/* Job selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, fontWeight: 900, color: theme.copper, letterSpacing: '0.10em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            {t('select_job')}
          </label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {analyses.map(a => {
              const color = a.score >= 70 ? theme.green : a.score >= 50 ? theme.gold : theme.red
              const isActive = selected?.id === a.id
              return (
                <button key={a.id} onClick={() => setSelected(a)} style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 999, background: isActive ? theme.navy : theme.paper, border: `1.5px solid ${isActive ? theme.navy : theme.line}`, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, boxShadow: isActive ? '0 12px 28px rgba(16,24,43,0.18)' : 'none', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: isActive ? theme.ivory : color, fontFamily: 'Georgia, serif' }}>{a.score}%</span>
                  <span style={{ fontSize: 12, color: isActive ? theme.ivory : theme.navy, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800 }}>
                    {a.result?.job_context?.title || a.job_title || t('job_fallback')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Main two-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,440px), 1fr))', gap: 18, alignItems: 'start' }}>

          {/* Left: Analysis coach */}
          <div style={{ position: 'sticky', top: 86 }}>
            {selected && <AnalysisCoach analysis={selected} t={t} />}
          </div>

          {/* Right: Tabbed tools panel */}
          <div style={{ ...card({ overflow: 'hidden' }) }}>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 4, padding: '12px 14px', borderBottom: `1px solid ${theme.line}`, background: 'var(--bg-input)' }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{ flex: 1, padding: '9px 6px', borderRadius: 12, border: `1.5px solid ${activeTab === tab.id ? theme.navy : 'transparent'}`, background: activeTab === tab.id ? theme.navy : 'transparent', color: activeTab === tab.id ? theme.ivory : theme.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.13s', letterSpacing: '0.01em' }}>
                  <span style={{ fontSize: 13 }}>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'letter' && (
              <CoverLetterPanel selected={selected} t={t} lang={lang} fullName={fullName} saveFullName={saveFullName} />
            )}
            {activeTab === 'messages' && (
              <div style={{ padding: '0' }}>
                <CommunicationAssetsCard selected={selected} />
              </div>
            )}
            {activeTab === 'cv' && (
              <div style={{ padding: '14px 18px' }}>
                <OptimizeCvPanel selected={selected} />
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
