import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { supabase } from '../lib/supabase'
import { getDeviceId } from '../utils/deviceId'
import './CareerIntelligencePage.css'

const STORAGE_KEY = 'joblytics_career_reports'

async function getFreshAccessToken(session) {
  if (session?.access_token) return session.access_token
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

function loadReports() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function saveReports(reports) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, 10))) } catch {}
}

function normalizeLocalEntry(report, targetRole = '') {
  return {
    id: `${Date.now()}`,
    created_at: new Date().toISOString(),
    target_role: report?.target_role || targetRole || 'Career Intelligence',
    target_market: report?.target_market || '',
    career_score: report?.career_score || 0,
    shortlist_probability: report?.recruiter_view?.shortlist_probability || 0,
    career_level: report?.career_level || '',
    market_position: report?.market_position || '',
    report,
    source: 'local'
  }
}

function toScore(value) {
  const score = Math.round(Number(value) || 0)
  return Math.max(0, Math.min(100, score))
}

function scoreDelta(current, previous) {
  if (!previous && previous !== 0) return '—'
  const delta = toScore(current) - toScore(previous)
  if (delta > 0) return `+${delta}`
  return `${delta}`
}

function list(items, t) {
  const safe = Array.isArray(items) ? items.filter(Boolean) : []
  if (!safe.length) return <p className="careerIntel-muted">{t ? t('ci_no_item', 'No specific item returned yet.') : 'No specific item returned yet.'}</p>
  return <ul>{safe.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
}

function MetricCard({ label, value, helper, tone = '' }) {
  return (
    <article className={`careerIntel-metric ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{helper}</span>
    </article>
  )
}

function ReportCard({ title, kicker, children }) {
  return (
    <article className="careerIntel-card">
      {kicker && <p className="careerIntel-kicker">{kicker}</p>}
      <h2>{title}</h2>
      {children}
    </article>
  )
}

function TextAreaField({ label, value, onChange, placeholder, rows = 8 }) {
  return (
    <label className="careerIntel-field">
      <span>{label}</span>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
    </label>
  )
}

function TrendSparkline({ reports, type = 'career_score', t }) {
  const points = [...reports].reverse().map(item => toScore(type === 'shortlist_probability' ? item.shortlist_probability : item.career_score)).filter(score => score > 0).slice(-10)
  if (points.length < 2) return <p className="careerIntel-muted">{t('ci_trend_need_two', 'Generate at least two reports to see trend movement.')}</p>
  const width = 240
  const height = 72
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const polyline = points.map((score, index) => {
    const x = (index / (points.length - 1)) * width
    const y = height - ((score - min) / range) * (height - 16) - 8
    return `${x},${y}`
  }).join(' ')
  return (
    <svg className="careerIntel-trendSvg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Score trend">
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((score, index) => {
        const x = (index / (points.length - 1)) * width
        const y = height - ((score - min) / range) * (height - 16) - 8
        return <circle key={`${score}-${index}`} cx={x} cy={y} r="5" fill="currentColor" />
      })}
    </svg>
  )
}

function AnalyticsPanel({ analytics, reports, t }) {
  const pct = v => v ? `${v}%` : '—'
  return (
    <section className="careerIntel-analytics">
      <article className="careerIntel-card careerIntel-analyticsIntro">
        <p className="careerIntel-kicker">{t('ci_analytics_kicker', 'Phase 2 Analytics')}</p>
        <h2>{t('ci_analytics_title', 'Career progress dashboard')}</h2>
        <p className="careerIntel-muted">{t('ci_analytics_desc', 'Track how your positioning evolves across reports. The analytics improve automatically as more Career Intelligence reports are generated and saved.')}</p>
      </article>

      <div className="careerIntel-analyticsGrid">
        <MetricCard label={t('ci_latest_career', 'Latest career score')} value={pct(analytics.latestCareer)} helper={t('ci_previous_delta', { prev: pct(analytics.previousCareer), delta: analytics.careerDelta }, `Previous: ${pct(analytics.previousCareer)} · Δ ${analytics.careerDelta}`)} tone="accent" />
        <MetricCard label={t('ci_latest_recruiter', 'Latest recruiter score')} value={pct(analytics.latestShortlist)} helper={t('ci_previous_delta', { prev: pct(analytics.previousShortlist), delta: analytics.shortlistDelta }, `Previous: ${pct(analytics.previousShortlist)} · Δ ${analytics.shortlistDelta}`)} tone="warm" />
        <MetricCard label={t('ci_best_report', 'Best report')} value={pct(analytics.bestCareer)} helper={analytics.bestRole || t('ci_no_report_yet', 'No report yet')} />
      </div>

      <div className="careerIntel-reportGrid">
        <ReportCard title={t('ci_career_trend', 'Career score trend')} kicker={t('ci_progress', 'Progress')}>
          <TrendSparkline reports={reports} type="career_score" t={t} />
          <p className="careerIntel-muted">{t('ci_avg_career', { v: pct(analytics.averageCareer) }, `Average career score: ${pct(analytics.averageCareer)}`)}</p>
        </ReportCard>
        <ReportCard title={t('ci_recruiter_trend', 'Recruiter score trend')} kicker={t('ci_shortlist_prob', 'Shortlist probability')}>
          <TrendSparkline reports={reports} type="shortlist_probability" t={t} />
          <p className="careerIntel-muted">{t('ci_avg_recruiter', { v: pct(analytics.averageShortlist) }, `Average recruiter score: ${pct(analytics.averageShortlist)}`)}</p>
        </ReportCard>
        <ReportCard title={t('ci_targeted_roles', 'Most targeted roles')} kicker={t('ci_focus', 'Focus')}>
          {analytics.roles.length ? (
            <div className="careerIntel-roleChips">
              {analytics.roles.map(role => <span key={role.name}>{role.name}<strong>{role.count}</strong></span>)}
            </div>
          ) : <p className="careerIntel-muted">{t('ci_roles_hint', 'Generate reports for different target roles to see your focus areas.')}</p>}
        </ReportCard>
        <ReportCard title={t('ci_improvement', 'Improvement signal')} kicker={t('ci_comparison', 'Comparison')}>
          <p className="careerIntel-block">{analytics.insight}</p>
        </ReportCard>
      </div>
    </section>
  )
}

export default function CareerIntelligencePage() {
  const { session } = useAuth()
  const { t } = useLang()
  const [cvText, setCvText] = useState('')
  const [linkedinText, setLinkedinText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [targetMarket, setTargetMarket] = useState('France and Europe')
  const [report, setReport] = useState(null)
  const [usage, setUsage] = useState(null)
  const [reports, setReports] = useState(() => loadReports())
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [storageMode, setStorageMode] = useState('local')
  const [error, setError] = useState('')
  const [checklist, setChecklist] = useState(null)

  const combinedLength = useMemo(() => [cvText, linkedinText].join(' ').trim().length, [cvText, linkedinText])
  const canRun = combinedLength >= 250 && !loading

  const analytics = useMemo(() => {
    const ordered = [...reports].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const latest = ordered[0]
    const previous = ordered[1]
    const scores = ordered.map(item => toScore(item.career_score)).filter(Boolean)
    const shortlistScores = ordered.map(item => toScore(item.shortlist_probability)).filter(Boolean)
    const best = ordered.reduce((winner, item) => toScore(item.career_score) > toScore(winner?.career_score) ? item : winner, null)
    const roleCounts = ordered.reduce((acc, item) => {
      const key = item.target_role || item.report?.target_role || 'Career Intelligence'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const roles = Object.entries(roleCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6)
    const latestCareer = toScore(latest?.career_score)
    const previousCareer = previous ? toScore(previous.career_score) : 0
    const latestShortlist = toScore(latest?.shortlist_probability)
    const previousShortlist = previous ? toScore(previous.shortlist_probability) : 0
    const careerChange = latest && previous ? latestCareer - previousCareer : 0
    const shortlistChange = latest && previous ? latestShortlist - previousShortlist : 0
    const stateStable = t('ci_state_stable', 'stable')
    const stateLower = n => t('ci_state_points_lower', { n }, `${n} points lower`)
    let insight = t('ci_insight_default', 'Generate at least two Career Intelligence reports to compare progress over time.')
    if (latest && previous) {
      if (careerChange > 0 && shortlistChange > 0) insight = t('ci_insight_both', { c: careerChange, s: shortlistChange }, `Strong improvement: your career score increased by ${careerChange} points and recruiter score increased by ${shortlistChange} points versus the previous report.`)
      else if (careerChange > 0) insight = t('ci_insight_career', { c: careerChange, state: shortlistChange === 0 ? stateStable : stateLower(Math.abs(shortlistChange)) }, `Career positioning improved by ${careerChange} points. Recruiter score is ${shortlistChange === 0 ? 'stable' : `${Math.abs(shortlistChange)} points lower`}, so keep strengthening evidence for the target role.`)
      else if (shortlistChange > 0) insight = t('ci_insight_shortlist', { s: shortlistChange, state: careerChange === 0 ? stateStable : stateLower(Math.abs(careerChange)) }, `Recruiter score improved by ${shortlistChange} points. Career score is ${careerChange === 0 ? 'stable' : `${Math.abs(careerChange)} points lower`}, so validate whether the new target role is more demanding.`)
      else if (careerChange === 0 && shortlistChange === 0) insight = t('ci_insight_stable', 'Scores are stable. The next improvement should come from adding measurable achievements, budget/vendor ownership, and stronger role-specific keywords.')
      else insight = t('ci_insight_lower', 'Latest scores are lower than the previous report. This may indicate a more ambitious target role or weaker evidence alignment. Review the gap analysis before applying.')
    }
    return {
      latestCareer,
      previousCareer,
      latestShortlist,
      previousShortlist,
      careerDelta: previous ? scoreDelta(latestCareer, previousCareer) : '—',
      shortlistDelta: previous ? scoreDelta(latestShortlist, previousShortlist) : '—',
      averageCareer: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      averageShortlist: shortlistScores.length ? Math.round(shortlistScores.reduce((a, b) => a + b, 0) / shortlistScores.length) : 0,
      bestCareer: best ? toScore(best.career_score) : 0,
      bestRole: best?.target_role || '',
      roles,
      insight
    }
  }, [reports, t])

  useEffect(() => saveReports(reports), [reports])

  useEffect(() => {
    let cancelled = false
    const loadCloudReports = async () => {
      const accessToken = await getFreshAccessToken(session)
      if (!accessToken) return
      setHistoryLoading(true)
      try {
        const res = await fetch('/api/career-reports', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Could not load cloud reports')
        if (!cancelled && Array.isArray(data.reports)) {
          setReports(data.reports)
          setStorageMode('cloud')
        }
      } catch {
        if (!cancelled) setStorageMode('local')
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }
    loadCloudReports()
    return () => { cancelled = true }
  }, [session])

  const saveCloudReport = async nextReport => {
    const accessToken = await getFreshAccessToken(session)
    if (!accessToken) return null
    const res = await fetch('/api/career-reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ report: nextReport, targetRole, targetMarket })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Could not save report to cloud')
    return data.report
  }

  const persistReport = async nextReport => {
    const localEntry = normalizeLocalEntry(nextReport, targetRole)
    try {
      const cloudEntry = await saveCloudReport(nextReport)
      if (cloudEntry) {
        setReports(prev => [cloudEntry, ...prev.filter(item => item.id !== cloudEntry.id)].slice(0, 20))
        setStorageMode('cloud')
        return
      }
    } catch {
      setStorageMode('local')
    }
    setReports(prev => [localEntry, ...prev].slice(0, 10))
  }

  const deleteReport = async entry => {
    setReports(prev => prev.filter(item => item.id !== entry.id))
    if (entry.source !== 'cloud') return
    try {
      const accessToken = await getFreshAccessToken(session)
      if (!accessToken) return
      await fetch(`/api/career-reports?id=${encodeURIComponent(entry.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      })
    } catch {}
  }

  const runReport = async () => {
    setError('')
    setChecklist(null)
    setReport(null)
    setUsage(null)

    if (combinedLength < 250) {
      setError(t('ci_err_min', 'Paste at least 250 characters from a CV, LinkedIn PDF, or professional profile before generating the report.'))
      return
    }

    setLoading(true)
    try {
      const accessToken = await getFreshAccessToken(session)
      if (!accessToken) {
        setError(t('ci_err_session', 'Your session could not be verified. Please refresh the page or sign in again.'))
        return
      }

      const res = await fetch('/api/career-intelligence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Joblytics-Device-Id': getDeviceId()
        },
        body: JSON.stringify({ cvText, linkedinText, jobDescription, targetRole, targetMarket })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.checklist) setChecklist(data.checklist)
        if (data?.usage) setUsage(data.usage)
        throw new Error(data?.error || `Server error ${res.status}`)
      }
      setUsage(data.usage || null)
      setReport(data.report)
      await persistReport(data.report)
    } catch (e) {
      setError(e.message || t('ci_err_failed', 'Career Intelligence report failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const loadSaved = entry => {
    setReport(entry.report)
    setError('')
    setChecklist(null)
  }

  return (
    <div className="careerIntel-page">
      <main className="careerIntel-shell">
        <section className="careerIntel-hero">
          <div>
            <p className="careerIntel-kicker">{t('ci_kicker', 'Career Intelligence')}</p>
            <h1>{t('ci_title', 'Know your market position before you apply.')}</h1>
            <p>{t('ci_subtitle', 'Turn your CV, LinkedIn PDF text, and target job into a recruiter-style career report: salary range, shortlist probability, missing evidence and next actions.')}</p>
          </div>
          <div className="careerIntel-heroScore">
            <strong>{report ? `${report.career_score}%` : 'AI'}</strong>
            <span>{report ? t('ci_career_score', 'Career score') : t('ci_career_report', 'Career report')}</span>
          </div>
        </section>

        <section className="careerIntel-grid">
          <article className="careerIntel-card careerIntel-formCard">
            <div className="careerIntel-formTop">
              <div>
                <p className="careerIntel-kicker">{t('ci_inputs', 'Inputs')}</p>
                <h2>{t('ci_generate_report', 'Generate report')}</h2>
              </div>
              <span>{t('ci_chars', { n: combinedLength }, `${combinedLength} chars`)}</span>
            </div>

            <div className="careerIntel-twoCols">
              <label className="careerIntel-field">
                <span>{t('ci_target_role', 'Target role')}</span>
                <input value={targetRole} onChange={e => setTargetRole(e.target.value)} placeholder={t('ci_target_role_ph', 'Head of IT, IT Operations Manager, Service Delivery Manager...')} />
              </label>
              <label className="careerIntel-field">
                <span>{t('ci_target_market', 'Target market')}</span>
                <input value={targetMarket} onChange={e => setTargetMarket(e.target.value)} placeholder={t('ci_target_market_ph', 'France, UK, Switzerland...')} />
              </label>
            </div>

            <TextAreaField label={t('ci_cv_text', 'CV text')} value={cvText} onChange={setCvText} placeholder={t('ci_cv_text_ph', 'Paste your CV text here...')} />
            <TextAreaField label={t('ci_linkedin_text', 'LinkedIn/profile text optional')} value={linkedinText} onChange={setLinkedinText} placeholder={t('ci_linkedin_text_ph', 'Paste LinkedIn PDF text or professional profile content...')} rows={6} />
            <TextAreaField label={t('ci_job_desc', 'Job description optional')} value={jobDescription} onChange={setJobDescription} placeholder={t('ci_job_desc_ph', 'Paste a target job description for sharper gap analysis...')} rows={6} />

            {usage && <p className="careerIntel-warning">{t('ci_usage', { plan: usage.planLabel, used: usage.used, limit: usage.limit }, `${usage.planLabel}: ${usage.used}/${usage.limit} Career Intelligence reports used this month.`)}</p>}
            {error && <p className="careerIntel-warning">{error}</p>}
            {checklist && <div className="careerIntel-checklist">{list(checklist, t)}</div>}

            <button type="button" className="careerIntel-primary" disabled={!canRun} onClick={runReport}>{loading ? t('ci_generating', 'Generating report...') : t('ci_generate_cta', 'Generate Career Intelligence')}</button>
          </article>

          <aside className="careerIntel-card careerIntel-history">
            <p className="careerIntel-kicker">{t('ci_saved_reports', 'Saved reports')}</p>
            <h2>{t('ci_career_history', 'Career history')}</h2>
            <p className="careerIntel-muted">{historyLoading ? t('ci_loading_cloud', 'Loading cloud history...') : storageMode === 'cloud' ? t('ci_synced', 'Synced to your account.') : t('ci_saved_local', 'Saved locally on this device.')}</p>
            {reports.length ? reports.map(entry => (
              <div key={entry.id} className="careerIntel-historyItem">
                <button type="button" onClick={() => loadSaved(entry)}>
                  <strong>{entry.target_role}</strong>
                  <span>{t('ci_item_scores', { c: entry.career_score, s: entry.shortlist_probability }, `${entry.career_score}% career · ${entry.shortlist_probability}% shortlist`)}</span>
                  <small>{new Date(entry.created_at).toLocaleDateString()} · {entry.source || storageMode}</small>
                </button>
                <button type="button" className="careerIntel-delete" onClick={() => deleteReport(entry)} aria-label={t('ci_delete_report', 'Delete report')}>×</button>
              </div>
            )) : <p className="careerIntel-muted">{t('ci_reports_empty', 'Generated reports will appear here for quick review.')}</p>}
          </aside>
        </section>

        <AnalyticsPanel analytics={analytics} reports={reports} t={t} />

        {report && (
          <section className="careerIntel-results">
            <div className="careerIntel-metrics">
              <MetricCard label={t('ci_career_score', 'Career score')} value={`${report.career_score}%`} helper={report.career_level || t('ci_current_level', 'Current level')} tone="accent" />
              <MetricCard label={t('ci_recruiter_score', 'Recruiter score')} value={`${report.recruiter_view?.shortlist_probability || 0}%`} helper={t('ci_shortlist_prob', 'Shortlist probability')} tone="warm" />
              <MetricCard label={t('ci_target_market', 'Target market')} value={report.target_market || t('ci_market', 'Market')} helper={report.market_position || t('ci_market_position', 'Market position')} />
            </div>

            <ReportCard title={t('ci_exec_summary', 'Executive summary')} kicker={t('ci_positioning', 'Positioning')}>
              <p className="careerIntel-block">{report.executive_summary}</p>
            </ReportCard>

            <div className="careerIntel-reportGrid">
              <ReportCard title={t('ci_salary', 'Salary intelligence')} kicker={t('ci_market_value', 'Market value')}>
                <div className="careerIntel-salary"><strong>France</strong><span>{report.salary_intelligence?.france || '—'}</span></div>
                <div className="careerIntel-salary"><strong>UK</strong><span>{report.salary_intelligence?.uk || '—'}</span></div>
                <div className="careerIntel-salary"><strong>Switzerland</strong><span>{report.salary_intelligence?.switzerland || '—'}</span></div>
                <p className="careerIntel-muted">{report.salary_intelligence?.note}</p>
              </ReportCard>

              <ReportCard title={t('ci_recruiter_view', 'Recruiter view')} kicker={t('ci_shortlist_logic', 'Shortlist logic')}>
                <h3>{t('ci_why_shortlisted', 'Why shortlisted')}</h3>{list(report.recruiter_view?.why_shortlisted, t)}
                <h3>{t('ci_risks', 'Risks')}</h3>{list(report.recruiter_view?.why_rejected, t)}
              </ReportCard>

              <ReportCard title={t('ci_gap_analysis', 'Gap analysis')} kicker={t('ci_what_missing', 'What is missing')}>
                <h3>{t('ci_missing_skills', 'Missing skills')}</h3>{list(report.gap_analysis?.missing_skills, t)}
                <h3>{t('ci_missing_evidence', 'Missing evidence')}</h3>{list(report.gap_analysis?.missing_evidence, t)}
                <h3>{t('ci_positioning_gaps', 'Positioning gaps')}</h3>{list(report.gap_analysis?.positioning_gaps, t)}
              </ReportCard>

              <ReportCard title={t('ci_best_fit', 'Best-fit roles')} kicker={t('ci_where_focus', 'Where to focus')}>
                {list(report.recruiter_view?.best_fit_roles, t)}
              </ReportCard>

              <ReportCard title={t('ci_roadmap', 'Roadmap')} kicker={t('ci_exec_plan', 'Execution plan')}>
                <h3>{t('ci_next_30', 'Next 30 days')}</h3>{list(report.roadmap?.next_30_days, t)}
                <h3>{t('ci_next_90', 'Next 90 days')}</h3>{list(report.roadmap?.next_90_days, t)}
                <h3>{t('ci_next_12', 'Next 12 months')}</h3>{list(report.roadmap?.next_12_months, t)}
              </ReportCard>

              <ReportCard title={t('ci_app_strategy', 'Application strategy')} kicker={t('ci_apply_smarter', 'Apply smarter')}>
                <h3>{t('ci_apply_now', 'Apply now')}</h3>{list(report.application_strategy?.apply_now, t)}
                <h3>{t('ci_avoid_now', 'Avoid for now')}</h3>{list(report.application_strategy?.avoid_for_now, t)}
                <p className="careerIntel-block">{report.application_strategy?.message_angle}</p>
              </ReportCard>
            </div>

            {report.warnings?.length > 0 && (
              <ReportCard title={t('ci_evidence_warnings', 'Evidence warnings')} kicker={t('ci_data_quality', 'Data quality')}>
                {list(report.warnings, t)}
              </ReportCard>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
