import React, { useEffect, useMemo, useState } from 'react'
import { useLang } from '../context/LangContext'
import LinkedInOAuthButton from '../components/LinkedInOAuthButton'
import { supabase } from '../lib/supabase'

function isLinkedInProfileUrl(value) {
  if (!value) return false
  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase()
    const isLinkedInHost = hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')
    const path = url.pathname.replace(/\/+$/, '')
    return url.protocol.startsWith('http') && isLinkedInHost && /^\/(in|pub)\/[^/]+/i.test(path)
  } catch {
    return false
  }
}

function downloadTextFile(fileName, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}


function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'))
    reader.readAsText(file)
  })
}

function formatReport(data) {
  const exp = data?.experience?.improvements || []
  return [
    'LinkedIn Optimized Profile',
    '',
    `Overall score: ${data?.overall_score ?? 0}/100`,
    data?.score_explanation || '',
    '',
    'HEADLINE',
    data?.headline?.improved_version || '',
    '',
    'ABOUT',
    data?.about?.improved_version || '',
    '',
    'EXPERIENCE',
    ...exp.flatMap(item => [
      item.role_title || 'Experience',
      ...(item.improved_bullets || []).map(bullet => `• ${bullet}`),
      ''
    ]),
    'SKILLS TO PIN',
    ...(data?.skills?.to_reorder_top_3 || []).map(skill => `• ${skill}`),
    '',
    'SKILLS TO ADD',
    ...(data?.skills?.to_add || []).map(skill => `• ${skill}`),
    '',
    'QUICK WINS',
    ...(data?.quick_wins || []).map(win => `• ${win}`),
    '',
    data?.honest_disclaimer || ''
  ].join('\n')
}

export default function LinkedInOptimizerPage() {
  const { t, lang } = useLang()
  const tr = (key, fallback) => t?.(key) || fallback

  const [profileUrl, setProfileUrl] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [userToggledMode, setUserToggledMode] = useState(false)
  const [headline, setHeadline] = useState('')
  const [about, setAbout] = useState('')
  const [experience, setExperience] = useState('')
  const [skills, setSkills] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [optimization, setOptimization] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState({})
  const [linkedinIdentity, setLinkedinIdentity] = useState(null)
  const [profileText, setProfileText] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [uploadLoading, setUploadLoading] = useState(false)
  const [dmaLoading, setDmaLoading] = useState(false)
  const [dmaStatus, setDmaStatus] = useState('')

  const urlValid = useMemo(() => isLinkedInProfileUrl(profileUrl), [profileUrl])
  const uploadValid = profileText.trim().length >= 50
  const pasteValid = headline.trim().length >= 5 || about.trim().length >= 30 || experience.trim().length >= 50
  const canSubmit = !loading && !uploadLoading && (uploadValid || (showPaste ? pasteValid : urlValid))

  useEffect(() => {
    if (!error || userToggledMode || showPaste) return undefined
    const lower = error.toLowerCase()
    const shouldSwitch = ['blocked', 'paste', 'login wall', 'could not read', 'linkedin returned'].some(signal => lower.includes(signal))
    if (!shouldSwitch) return undefined

    const timer = window.setTimeout(() => {
      setShowPaste(true)
      window.setTimeout(() => document.querySelector('textarea[data-section="about"]')?.focus(), 100)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [error, userToggledMode, showPaste])


  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/linkedin/me')
      .then(response => response.json())
      .then(data => {
        if (!cancelled && data.connected) setLinkedinIdentity(data.profile)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const dmaConnected = params.get('linkedin_dma')
    const dmaError = params.get('linkedin_dma_error')

    if (dmaConnected === 'connected') {
      setDmaStatus('LinkedIn data authorization completed. Importing profile data...')
      importLinkedInDmaData()
      window.history.replaceState({}, '', window.location.pathname)
    }

    if (dmaError) {
      setError(`LinkedIn data import failed: ${dmaError}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function optimize() {
    if (!canSubmit) return
    setError('')
    setLoading(true)
    setOptimization(null)

    try {
      const body = profileText.trim()
        ? { profileText: profileText.trim(), targetRole, lang }
        : showPaste
          ? { headline, about, experience, skills, targetRole, lang }
          : { profileUrl: profileUrl.trim(), targetRole, lang }

      const token = (await supabase.auth.getSession()).data?.session?.access_token
      const response = await fetch('/api/linkedin-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body)
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Server error ${response.status}`)
      }

      setOptimization(data.optimization)
      window.setTimeout(() => {
        document.getElementById('linkedin-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (err) {
      setError(err.message || tr('linkedin_error', 'Could not analyze profile. Please try again.'))
    } finally {
      setLoading(false)
    }
  }


  function startLinkedInDmaImport() {
    setError('')
    setDmaStatus('Redirecting to LinkedIn for full profile data consent...')
    window.location.assign('/api/linkedin-dma/start')
  }

  async function importLinkedInDmaData() {
    setError('')
    setDmaLoading(true)
    setDmaStatus('Importing LinkedIn profile data...')

    try {
      const response = await fetch('/api/linkedin-dma/import')
      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.success) {
        throw new Error(data.error || `LinkedIn import failed with status ${response.status}`)
      }

      setProfileText((data.profileText || '').slice(0, 40000))
      setUploadName('LinkedIn Data Portability Import')
      setShowPaste(false)
      setDmaStatus(`LinkedIn data imported: ${data.domains?.join(', ') || 'profile data'}. You can now optimize it.`)
    } catch (err) {
      setError(err.message || 'Could not import LinkedIn data.')
      setDmaStatus('')
    } finally {
      setDmaLoading(false)
    }
  }

  async function handleProfileUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    setUploadLoading(true)
    setProfileText('')
    setUploadName(file.name)

    try {
      if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        const text = await readTextFile(file)
        if (text.trim().length < 50) throw new Error('This text file does not contain enough profile content.')
        setProfileText(text.slice(0, 12000))
        setShowPaste(false)
        return
      }

      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Please upload a LinkedIn PDF or a .txt file.')
      }

      const base64 = await fileToBase64(file)
      const token = (await supabase.auth.getSession()).data?.session?.access_token
      const response = await fetch('/api/linkedin-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ type: 'extract-pdf', fileBase64: base64, fileName: file.name })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not extract text from this PDF.')

      setProfileText(data.text)
      setShowPaste(false)
    } catch (err) {
      setError(err.message || 'Could not process this file. Please use paste mode.')
      setProfileText('')
    } finally {
      setUploadLoading(false)
    }
  }

  async function disconnectLinkedIn() {
    await fetch('/api/auth/linkedin/logout', { method: 'POST' }).catch(() => {})
    setLinkedinIdentity(null)
  }

  function clearUploadedProfile() {
    setProfileText('')
    setUploadName('')
  }

  function togglePasteMode() {
    setShowPaste(value => !value)
    setUserToggledMode(true)
    setError('')
  }

  async function copyToClipboard(text, key) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopied(prev => ({ ...prev, [key]: true }))
      window.setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 1800)
    } catch {
      setError(tr('copy_failed', 'Copy failed. Please select the text manually.'))
    }
  }

  function downloadReport() {
    if (!optimization) return
    downloadTextFile('LinkedIn-optimized-profile.txt', formatReport(optimization))
  }

  function downloadJson() {
    if (!optimization) return
    downloadTextFile('LinkedIn-optimized-profile.json', JSON.stringify(optimization, null, 2), 'application/json;charset=utf-8')
  }

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: 'clamp(20px,4vw,40px) clamp(16px,4vw,32px)' }}>
      <header style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          🔗 {tr('linkedin_kicker', 'LinkedIn Optimizer')}
        </p>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(22px,5vw,34px)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          {tr('linkedin_title', 'Make your LinkedIn profile recruiter-magnet')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {tr('linkedin_subtitle_url', 'Connect LinkedIn for identity, then upload your LinkedIn PDF or paste profile sections for the actual analysis. URL mode remains optional and may be blocked by LinkedIn.')}
        </p>
        <div style={{ marginTop: 16 }}>
          {linkedinIdentity ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }}>
              {linkedinIdentity.picture ? <img src={linkedinIdentity.picture} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={linkedinBadgeStyle}>in</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, margin: 0 }}>LinkedIn connected{linkedinIdentity.name ? ` · ${linkedinIdentity.name}` : ''}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Identity connected. Use the import button to request full LinkedIn profile data, or upload your PDF/paste sections.</p>
                {dmaStatus && <p style={{ fontSize: 11, color: 'var(--accent)', margin: '4px 0 0 0' }}>{dmaStatus}</p>}
              </div>
              <button type="button" onClick={startLinkedInDmaImport} disabled={dmaLoading} style={dmaButtonStyle}>
                {dmaLoading ? 'Importing...' : 'Import full LinkedIn profile'}
              </button>
              <button type="button" onClick={disconnectLinkedIn} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}>Disconnect</button>
            </div>
          ) : (
            <LinkedInOAuthButton style={{ maxWidth: 280 }}>Connect LinkedIn account</LinkedInOAuthButton>
          )}
        </div>
      </header>

      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 'clamp(16px,3vw,24px)', marginBottom: 24 }}>
        <FieldLabel accent icon="🎯" label={tr('linkedin_target_role', 'Target role')} optional={tr('optional', 'optional')} />
        <input
          value={targetRole}
          onChange={event => setTargetRole(event.target.value)}
          placeholder={tr('linkedin_target_placeholder', 'e.g. IT Manager · Endpoint Manager · Microsoft Intune Lead')}
          style={{ fontSize: 14, width: '100%' }}
          disabled={loading}
        />
        <p style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4, marginBottom: 18 }}>
          {tr('linkedin_target_hint', 'The role you want to be found for. This tunes the optimization.')}
        </p>

        <div style={{ marginBottom: 18, padding: '14px 16px', background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <FieldLabel icon="📄" label={tr('linkedin_upload_label', 'Upload LinkedIn PDF')} optional={tr('recommended', 'recommended')} />
          <input
            type="file"
            accept="application/pdf,.pdf,text/plain,.txt"
            onChange={handleProfileUpload}
            disabled={loading || uploadLoading}
            style={{ fontSize: 12, color: 'var(--text-secondary)', width: '100%' }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 8, lineHeight: 1.5 }}>
            {uploadLoading
              ? 'Extracting profile text...'
              : profileText
                ? `✓ ${uploadName || 'Profile file'} loaded. ${profileText.length} characters extracted.`
                : 'Export your LinkedIn profile as PDF, upload it here, then run the optimizer.'}
          </p>
          {profileText && (
            <button type="button" onClick={clearUploadedProfile} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', padding: 0, marginTop: 4 }}>
              Clear uploaded profile
            </button>
          )}
        </div>

        {!profileText && !showPaste && (
          <div>
            <FieldLabel icon="🔗" label={tr('linkedin_url_label', 'LinkedIn profile URL')} />
            <input
              type="url"
              value={profileUrl}
              onChange={event => { setProfileUrl(event.target.value); if (error) setError('') }}
              placeholder="https://www.linkedin.com/in/yourname"
              style={{ fontSize: 14, width: '100%' }}
              disabled={loading}
            />
            <p style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6, lineHeight: 1.5 }}>
              💡 {tr('linkedin_url_hint', "LinkedIn normally blocks automated reads. Paste mode is the reliable option if URL mode fails.")}
            </p>
          </div>
        )}

        {!profileText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <button type="button" onClick={togglePasteMode} style={toggleButtonStyle} disabled={loading}>
              {showPaste
                ? `↑ ${tr('linkedin_use_url', 'Use URL instead')}`
                : `✏️ ${tr('linkedin_or_paste', 'OR paste profile sections')}`}
            </button>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        )}

        {!profileText && showPaste && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 10 }}>
              💡 <strong>{tr('linkedin_paste_howto_title', 'How to copy:')}</strong> {tr('linkedin_paste_howto_body', 'Open your LinkedIn profile, expand the sections, then copy/paste Headline, About, Experience and Skills. Headline + About is enough to test.')}
            </p>

            <TextInput
              label={tr('linkedin_section_headline', 'Headline')}
              hint={`${headline.length}/220`}
              value={headline}
              onChange={value => setHeadline(value.slice(0, 220))}
              placeholder={tr('linkedin_headline_placeholder', 'e.g. Senior IT Manager · Intune · ITSM · Team Leadership')}
              disabled={loading}
            />

            <TextareaInput
              label={tr('linkedin_section_about', 'About / Summary')}
              hint={`${about.length} chars`}
              value={about}
              onChange={setAbout}
              placeholder={tr('linkedin_about_placeholder', 'Paste your LinkedIn About section here.')}
              rows={5}
              maxLength={3000}
              disabled={loading}
              dataSection="about"
            />

            <TextareaInput
              label={tr('linkedin_section_experience', 'Experience')}
              hint={tr('optional', 'optional')}
              value={experience}
              onChange={setExperience}
              placeholder={tr('linkedin_experience_placeholder', 'Paste your most recent 1-3 experience entries.')}
              rows={5}
              maxLength={4000}
              disabled={loading}
            />

            <TextInput
              label={tr('linkedin_section_skills', 'Skills')}
              hint={tr('optional', 'optional')}
              value={skills}
              onChange={setSkills}
              placeholder={tr('linkedin_skills_placeholder', 'Comma-separated: Intune, ITIL, Jira, Team Leadership...')}
              disabled={loading}
            />
          </div>
        )}

        {error && (
          <div style={{ marginTop: 6, marginBottom: 14, padding: '10px 12px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 10 }}>
            <p style={{ fontSize: 12, color: '#ff6b6b', lineHeight: 1.5, margin: 0 }}>⚠ {error}</p>
            {!showPaste && error.toLowerCase().includes('paste') && (
              <button type="button" onClick={togglePasteMode} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 6, padding: 0 }}>
                → {tr('linkedin_switch_to_paste', 'Switch to paste mode')}
              </button>
            )}
          </div>
        )}

        <button type="button" onClick={optimize} disabled={!canSubmit} className="btn-primary" style={{ width: '100%', opacity: canSubmit ? 1 : 0.55 }}>
          {loading ? `⏳ ${tr('linkedin_loading', 'Analyzing your profile...')}` : `✨ ${tr('linkedin_cta', 'Optimize my profile →')}`}
        </button>

        {!canSubmit && !loading && (
          <p style={{ fontSize: 11, color: 'var(--text-hint)', textAlign: 'center', marginTop: 8 }}>
            {showPaste
              ? tr('linkedin_min_warning', 'Fill at least Headline, About, or Experience to start.')
              : tr('linkedin_url_warning', 'Upload your LinkedIn PDF, paste profile sections, or enter a valid LinkedIn URL.')}
          </p>
        )}
      </section>

      {optimization && (
        <section id="linkedin-results" style={{ animation: 'fadeUp 0.4s ease' }}>
          {optimization.warning && (
            <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(245,166,35,0.25)', background: 'rgba(245,166,35,0.08)', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
              ⚠ {optimization.warning}
            </div>
          )}

          <OverallScoreCard data={optimization} tr={tr} />
          <SectionCard
            title={tr('linkedin_section_headline', 'Headline')}
            icon="📌"
            section={optimization.headline}
            copied={copied.headline}
            onCopy={() => copyToClipboard(optimization.headline?.improved_version || '', 'headline')}
            tr={tr}
          />
          <SectionCard
            title={tr('linkedin_section_about', 'About / Summary')}
            icon="💬"
            section={optimization.about}
            copied={copied.about}
            onCopy={() => copyToClipboard(optimization.about?.improved_version || '', 'about')}
            preserveLines
            tr={tr}
          />

          {!!optimization.experience?.improvements?.length && (
            <ExperienceCard data={optimization.experience} copied={copied} onCopy={copyToClipboard} tr={tr} />
          )}
          {optimization.skills && <SkillsCard data={optimization.skills} tr={tr} />}
          {!!optimization.quick_wins?.length && <QuickWinsCard wins={optimization.quick_wins} tr={tr} />}

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 'clamp(16px,3vw,24px)', marginBottom: 18 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, fontFamily: 'Syne, sans-serif' }}>
              ⬇️ {tr('linkedin_download_title', 'Download your optimized profile')}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
              {tr('linkedin_download_desc', 'Download a plain-text report or the raw JSON response for debugging.')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 8 }}>
              <button type="button" onClick={downloadReport} className="btn-primary">⬇ Download .txt</button>
              <button type="button" onClick={downloadJson} style={secondaryButtonStyle}>⬇ Download .json</button>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-hint)', textAlign: 'center', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 30 }}>
            ℹ️ {optimization.honest_disclaimer || tr('linkedin_disclaimer', 'Review carefully before publishing on LinkedIn. AI optimizes wording but does not verify facts.')}
          </p>
        </section>
      )}
    </main>
  )
}

function FieldLabel({ label, icon, optional, accent = false }) {
  return (
    <label style={{ fontSize: 10, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
      {icon ? `${icon} ` : ''}{label} {optional && <span style={{ textTransform: 'none', color: 'var(--text-hint)', fontWeight: 400 }}>· {optional}</span>}
    </label>
  )
}

function TextInput({ label, hint, value, onChange, placeholder, disabled }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <FieldLabel label={label} optional={hint} />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} style={{ fontSize: 14, width: '100%' }} />
    </div>
  )
}

function TextareaInput({ label, hint, value, onChange, placeholder, rows, maxLength, disabled, dataSection }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <FieldLabel label={label} optional={hint} />
      <textarea
        data-section={dataSection}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        style={{ fontSize: 13, resize: 'vertical', width: '100%' }}
      />
    </div>
  )
}

function OverallScoreCard({ data, tr }) {
  const score = data.overall_score || 0
  const headlineScore = data.headline?.improved_score || 0
  const aboutScore = data.about?.improved_score || 0
  const expScore = data.experience?.current_score || 0
  const skillsScore = data.skills?.current_score || 0
  const projectedScore = Math.min(100, Math.max(score, Math.round(((headlineScore + aboutScore + expScore + skillsScore) / 40) * 100)))
  const color = score >= 70 ? '#4caf7d' : score >= 50 ? '#f5a623' : '#ff6b6b'

  return (
    <div style={cardStyle}>
      <p style={kickerStyle}>📊 {tr('linkedin_overall_score', 'Overall profile score')}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <ScoreBlock label={tr('linkedin_now', 'Now')} score={score} color={color} />
        <div style={{ fontSize: 22, color: 'var(--text-muted)' }}>→</div>
        <ScoreBlock label={tr('linkedin_after', 'After improvements')} score={projectedScore} color="#4caf7d" />
      </div>
      {data.score_explanation && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 14 }}>{data.score_explanation}</p>}
    </div>
  )
}

function ScoreBlock({ label, score, color }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</p>
      <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 36, fontWeight: 700, color, lineHeight: 1 }}>
        {score}<span style={{ fontSize: 16, color: 'var(--text-muted)' }}>/100</span>
      </p>
    </div>
  )
}

function SectionCard({ title, icon, section, copied, onCopy, preserveLines, tr }) {
  if (!section?.improved_version) return null
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>{icon} {title}</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
          <span style={{ color: 'var(--text-muted)' }}>{section.current_score}/10</span>
          <span style={{ color: 'var(--accent)' }}>→</span>
          <span style={{ color: '#4caf7d', fontWeight: 700 }}>{section.improved_score}/10</span>
        </div>
      </div>

      {!!section.issues?.length && <Issues issues={section.issues} tr={tr} />}

      <p style={{ fontSize: 10, fontWeight: 700, color: '#4caf7d', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
        ✨ {tr('linkedin_improved', 'Improved version')} — {tr('copy_paste_ready', 'copy-paste ready')}
      </p>
      <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: preserveLines ? 'pre-wrap' : 'normal', wordBreak: 'break-word' }}>
          {section.improved_version}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={onCopy} style={copyButtonStyle(copied)}>
          {copied ? `✓ ${tr('copied', 'Copied')}` : `📋 ${tr('copy', 'Copy')}`}
        </button>
        {section.why_better && <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', flex: 1, minWidth: 200 }}>{section.why_better}</p>}
      </div>
    </div>
  )
}

function Issues({ issues, tr }) {
  return (
    <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(255,142,107,0.06)', border: '1px solid rgba(255,142,107,0.2)', borderRadius: 10 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#ff8e6b', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>{tr('linkedin_issues', 'Issues')}</p>
      <ul style={{ paddingLeft: 16, margin: 0 }}>
        {issues.map((issue, index) => <li key={index} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 2 }}>{issue}</li>)}
      </ul>
    </div>
  )
}

function ExperienceCard({ data, copied, onCopy, tr }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>💼 {tr('linkedin_section_experience', 'Experience')}</p>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.current_score}/10</span>
      </div>
      {!!data.issues?.length && <Issues issues={data.issues} tr={tr} />}
      {data.improvements.map((item, index) => {
        const bullets = item.improved_bullets || []
        const copyText = bullets.map(bullet => `• ${bullet}`).join('\n')
        return (
          <div key={index} style={{ marginBottom: 14, padding: '14px 16px', background: 'var(--bg-input)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>{item.role_title}</p>
            <ul style={{ paddingLeft: 16, margin: 0, marginBottom: 10 }}>
              {bullets.map((bullet, bulletIndex) => <li key={bulletIndex} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4 }}>{bullet}</li>)}
            </ul>
            <button type="button" onClick={() => onCopy(copyText, `exp${index}`)} style={copyButtonStyle(copied[`exp${index}`])}>
              {copied[`exp${index}`] ? `✓ ${tr('copied', 'Copied')}` : `📋 ${tr('copy_bullets', 'Copy bullets')}`}
            </button>
          </div>
        )
      })}
      {data.general_advice && <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>💡 {data.general_advice}</p>}
    </div>
  )
}

function SkillsCard({ data, tr }) {
  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: 12 }}>🛠 {tr('linkedin_section_skills', 'Skills')}</p>
      <PillGroup title={`⭐ ${tr('linkedin_pin_top3', 'Pin these as top 3')}`} items={data.to_reorder_top_3} variant="accent" />
      <PillGroup title={`➕ ${tr('linkedin_add_skills', 'Add')}`} items={data.to_add} variant="green" />
      <PillGroup title={`➖ ${tr('linkedin_remove_skills', 'Remove')}`} items={data.to_remove} variant="orange" strike />
      {data.rationale && <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 8, lineHeight: 1.6 }}>💡 {data.rationale}</p>}
    </div>
  )
}

function PillGroup({ title, items = [], variant, strike = false }) {
  if (!items.length) return null
  const styles = {
    accent: { background: 'var(--accent-bg)', border: '1px solid var(--accent)', color: 'var(--accent)' },
    green: { background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', color: '#4caf7d' },
    orange: { background: 'rgba(255,142,107,0.08)', border: '1px solid rgba(255,142,107,0.25)', color: '#ff8e6b' }
  }[variant]

  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: styles.color, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>{title}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map((item, index) => <span key={index} style={{ padding: '4px 10px', borderRadius: 14, fontSize: 12, fontWeight: 600, textDecoration: strike ? 'line-through' : 'none', ...styles }}>{item}</span>)}
      </div>
    </div>
  )
}

function QuickWinsCard({ wins, tr }) {
  return (
    <div style={{ background: 'rgba(76,175,125,0.06)', border: '1px solid rgba(76,175,125,0.25)', borderRadius: 18, padding: 'clamp(16px,3vw,24px)', marginBottom: 14 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#4caf7d', fontFamily: 'Syne, sans-serif', marginBottom: 10 }}>⚡ {tr('linkedin_quick_wins', 'Quick wins')}</p>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        {wins.map((win, index) => <li key={index} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 4 }}>{win}</li>)}
      </ul>
    </div>
  )
}

const linkedinBadgeStyle = {
  width: 42,
  height: 42,
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0A66C2',
  color: '#fff',
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1
}

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 18,
  padding: 'clamp(16px,3vw,24px)',
  marginBottom: 14
}

const kickerStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  marginBottom: 10
}

const toggleButtonStyle = {
  fontSize: 12,
  color: 'var(--accent)',
  background: 'var(--accent-bg)',
  border: '1px solid var(--accent)',
  cursor: 'pointer',
  padding: '6px 14px',
  whiteSpace: 'nowrap',
  fontWeight: 600,
  borderRadius: 20,
  fontFamily: 'inherit'
}

const dmaButtonStyle = {
  padding: '8px 12px',
  borderRadius: 20,
  background: 'var(--accent)',
  border: 'none',
  color: '#1A1B22',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'Syne, sans-serif',
  whiteSpace: 'nowrap'
}

const secondaryButtonStyle = {
  padding: '12px',
  borderRadius: 12,
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit'
}

function copyButtonStyle(copied) {
  return {
    padding: '8px 14px',
    borderRadius: 20,
    background: copied ? 'rgba(76,175,125,0.15)' : 'var(--accent)',
    border: copied ? '1px solid rgba(76,175,125,0.3)' : 'none',
    color: copied ? '#4caf7d' : '#1A1B22',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Syne, sans-serif'
  }
}
