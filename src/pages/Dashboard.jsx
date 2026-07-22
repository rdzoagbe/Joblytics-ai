import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import StatusPill from '../components/StatusPill'
import DeleteAllModal from '../components/DeleteAllModal'
import { sanitizeAnalysisForDisplay } from '../utils/analysisSanitizer'
import './HistoryPage.css'
import './JobTrackerPhase4.css'
import './history-master-detail.css'

const PAGE_SIZE = 8

function scoreValue(analysis) {
  const score = Number(analysis?.score ?? analysis?.result?.display_score ?? analysis?.result?.match_probability)
  return Number.isFinite(score) ? Math.round(score) : 0
}

function scoreTone(score) {
  if (score >= 75) return 'strong'
  if (score >= 55) return 'medium'
  return 'weak'
}

function getStatusLabel(status, t) {
  const key = ({ saved: 'dash_status_saved', applied: 'dash_status_applied', interview: 'dash_status_interview', offer: 'dash_status_offer', rejected: 'dash_status_rejected', withdrawn: 'dash_status_archived' })[status || 'saved'] || 'dash_status_saved'
  const fallback = ({ saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Archived' })[status || 'saved'] || 'Saved'
  return t ? t(key, fallback) : fallback
}

function getPipelineStatus(analysis) {
  return analysis?.application_status || 'saved'
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function listOf(value, limit = 6) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : []
}

function unique(items = [], limit = 8) {
  return [...new Set(items.filter(Boolean))].slice(0, limit)
}

function getJobTitle(analysis, t) {
  const result = analysis?.result || {}
  const ctx = result.job_context || {}
  const fallbackTitle = (() => {
    try { return new URL(analysis.job_url).hostname.replace('www.', '') } catch { return t('history_job_analysis', 'Job analysis') }
  })()
  return safeText(analysis?.job_title || ctx.job_title || ctx.title || result?.job_title, fallbackTitle)
}

function getJobCompany(analysis) {
  const company = analysis?.result?.job_context?.company
  return company && !['Not specified', 'Not stated'].includes(company) ? company : ''
}

function getJobDisplay(analysis, t) {
  const result = analysis?.result || {}
  const ctx = result.job_context || {}
  return {
    title: getJobTitle(analysis, t),
    company: getJobCompany(analysis),
    location: ctx.location && ctx.location !== 'Not specified' ? ctx.location : '',
    salary: (ctx.salary && ctx.salary !== 'Not stated') ? ctx.salary : (ctx.salary_range && ctx.salary_range !== 'Not specified' ? ctx.salary_range : ''),
    workMode: ctx.work_mode && !['unknown', 'Not stated'].includes(ctx.work_mode) ? ctx.work_mode : '',
    contract: ctx.contract_type && !['unknown', 'Not stated'].includes(ctx.contract_type) ? ctx.contract_type : '',
    sourceUrl: analysis?.job_url && analysis.job_url !== 'manual_paste' ? analysis.job_url : '',
    summary: ctx.job_summary || result.job_summary || result.match_reasoning || '',
    verdict: result.recruiter_shortlist?.verdict || result.overall_verdict || '',
    recruiterReason: result.recruiter_screening_summary || result.recruiter_shortlist?.reason || result.overall_reason || result.match_reasoning || '',
    nextAction: result.next_best_action?.label || result.next_best_action?.action || '',
    nextReason: result.next_best_action?.reason || '',
    createdAt: analysis?.created_at
  }
}

function getHistoryLists(result = {}) {
  const cleanKeywords = result.keywords_analysis || {}
  const cleanReq = result.requirements_analysis || {}
  const strict = result.strict_ats_result?.analysis || {}
  return {
    foundKeywords: unique([...(cleanKeywords.found_in_cv || []), ...(result.keyword_match?.found || [])], 8),
    missingKeywords: unique([...(cleanKeywords.missing_keywords || []), ...(result.keyword_match?.missing_required || []), ...(strict.missing_skills || [])], 8),
    quickWins: listOf(result.quick_wins, 5),
    gaps: unique([...(result.gaps_to_address || []), ...(result.critical_gaps || []), ...(cleanReq.requirements_missing || []), ...(strict.needs_proof || [])], 5),
    met: unique([...(cleanReq.requirements_met || []), ...(result.requirements_check?.met || [])], 5),
    unmet: unique([...(cleanReq.requirements_missing || []), ...(result.requirements_check?.unmet || []), ...(strict.missing_skills || [])], 5)
  }
}

function verdictLabel(value, t) {
  return ({ likely_passed: t('likely_passed', 'Likely passed'), borderline: t('borderline', 'Borderline'), likely_filtered: t('likely_filtered', 'Likely filtered'), strong_shortlist: t('dash_verdict_strong_shortlist', 'Strong shortlist'), possible_shortlist: t('dash_verdict_possible_shortlist', 'Possible shortlist'), unlikely_shortlist: t('dash_verdict_unlikely_shortlist', 'Unlikely shortlist') })[value] || t('verdict_unknown', 'Unknown')
}

function formatDate(value, lang = 'en') {
  if (!value) return '—'
  const localeMap = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT', pt: 'pt-PT' }
  return new Date(value).toLocaleDateString(localeMap[lang] || 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(value, lang = 'en') {
  if (!value) return ''
  const localeMap = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT', pt: 'pt-PT' }
  return new Date(value).toLocaleTimeString(localeMap[lang] || 'en-US', { hour: '2-digit', minute: '2-digit' })
}

function daysSince(value) {
  if (!value) return null
  const diff = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diff)) return null
  return Math.floor(diff / 86400000)
}

const PIPELINE_STAGES = [
  { key: 'all', labelKey: 'pipeline_all', fallback: 'All', color: 'var(--text-secondary)' },
  { key: 'saved', labelKey: 'pipeline_saved', fallback: 'Saved', color: '#8DA3BD' },
  { key: 'applied', labelKey: 'pipeline_applied', fallback: 'Applied', color: '#3b82f6' },
  { key: 'interview', labelKey: 'pipeline_interview', fallback: 'Interview', color: '#8b5cf6' },
  { key: 'offer', labelKey: 'pipeline_offer', fallback: 'Offer', color: '#10b981' },
  { key: 'rejected', labelKey: 'pipeline_rejected', fallback: 'Rejected', color: '#ef4444' }
]

function PipelineBar({ counts, filter, onFilter, t }) {
  return (
    <section className="historyMD-card" style={{ padding: '16px 20px' }}>
      <p className="historyMD-kicker" style={{ marginBottom: 12 }}>{t('pipeline_kicker', 'Application pipeline')}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {PIPELINE_STAGES.map(({ key, labelKey, fallback, color }) => {
          const count = counts[key] ?? 0
          const active = filter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFilter(active && key !== 'all' ? 'all' : key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                borderRadius: 10, border: `1.5px solid ${active ? color : 'var(--border)'}`,
                background: active ? `${color}18` : 'var(--bg-input)',
                color: active ? color : 'var(--text-secondary)',
                fontWeight: 700, cursor: 'pointer', fontSize: 13, transition: 'all 0.15s'
              }}
            >
              {t(labelKey, fallback)}
              <span style={{ fontSize: 16, fontWeight: 800, color }}>· {count}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function FollowUpNudge({ analysis, days, onGenerateMessage, t, small = false }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      marginTop: small ? 4 : 12, padding: small ? '3px 8px' : '8px 12px', borderRadius: 8,
      background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)',
      color: '#b45309', fontSize: small ? 11 : 13, fontWeight: 600
    }}>
      <span>{t('nudge_follow_up', { n: days }, 'Applied {n} days ago — time to follow up')}</span>
      <button
        type="button"
        onClick={event => { event.stopPropagation(); onGenerateMessage?.(analysis) }}
        disabled={!onGenerateMessage}
        style={{
          border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.18)', color: '#92400e',
          borderRadius: 6, padding: small ? '1px 7px' : '4px 10px', fontSize: small ? 10 : 12,
          fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
        }}
      >
        {t('nudge_follow_up_cta', 'Write follow-up')}
      </button>
    </div>
  )
}

function InterviewHint({ analysis, onSelectAnalysis, t, small = false }) {
  return (
    <button
      type="button"
      onClick={event => { event.stopPropagation(); onSelectAnalysis?.(analysis) }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        marginTop: small ? 4 : 12, padding: small ? '2px 8px' : '6px 12px', borderRadius: 8,
        background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.30)',
        color: '#7c3aed', fontSize: small ? 11 : 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
      }}
    >
      {t('nudge_interview_prep', 'Interview stage — prep now')}
    </button>
  )
}

function StatCard({ label, value, helper, icon }) {
  return <article className="historyMD-stat"><span>{icon}</span><div><p>{label}</p><strong>{value}</strong><em>{helper}</em></div></article>
}

function EmptyState({ title, text, action, onAction }) {
  return <div className="historyMD-empty"><span>H</span><h3>{title}</h3><p>{text}</p>{action && <button type="button" onClick={onAction}>{action}</button>}</div>
}

function DetailList({ title, items, empty, tone = 'neutral' }) {
  return <div className={`historyMD-detailList historyMD-detailList--${tone}`}><strong>{title}</strong>{items.length ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p>{empty}</p>}</div>
}

export default function Dashboard({ onNewAnalysis, onSelectAnalysis, onBuildCv, onGenerateMessage }) {
  const { user } = useAuth()
  const { t, lang } = useLang()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => { fetchAnalyses() }, [])

  const fetchAnalyses = async () => {
    setLoading(true)
    setFetchError(false)
    const { data, error } = await supabase.from('analyses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(120)
    if (error) {
      setFetchError(true)
    } else {
      setAnalyses(data || [])
      setSelectedId(data?.[0]?.id || null)
    }
    setLoading(false)
  }

  const deleteAnalysis = async (id, event) => {
    event?.stopPropagation?.()
    setDeleting(id)
    const { error } = await supabase.from('analyses').delete().eq('id', id)
    if (!error) {
      setAnalyses(prev => prev.filter(item => item.id !== id))
      setSelectedId(current => current === id ? null : current)
    }
    setDeleting(null)
  }

  const handleDeleteAll = async () => {
    if (!user) throw new Error('Not signed in')
    const { error } = await supabase.from('analyses').delete().eq('user_id', user.id)
    if (error) throw error
    setAnalyses([])
    setSelectedId(null)
    setDeleteAllOpen(false)
  }

  const enriched = useMemo(() => analyses.map(item => {
    const result = sanitizeAnalysisForDisplay(item.result || {})
    return { ...item, result, score: scoreValue({ ...item, result }), display: getJobDisplay({ ...item, result }, t) }
  }), [analyses, t])

  const stats = useMemo(() => {
    const scores = enriched.map(item => item.score).filter(score => Number.isFinite(score))
    const avg = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0
    const strong = enriched.filter(item => item.score >= 75).length
    const needsWork = enriched.filter(item => item.score < 55).length
    const latest = enriched[0]
    return { total: enriched.length, avg, strong, needsWork, latest }
  }, [enriched])

  const pipelineCounts = useMemo(() => {
    const counts = { all: enriched.length, saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 }
    enriched.forEach(item => {
      const s = getPipelineStatus(item)
      if (s in counts) counts[s]++
    })
    return counts
  }, [enriched])

  const enrichedWithDelta = useMemo(() => {
    const byKey = new Map()
    enriched.forEach(item => {
      const key = item.job_url && item.job_url !== 'manual_paste'
        ? item.job_url
        : `t:${(item.display.title || '').toLowerCase().slice(0, 40)}`
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(item)
    })
    const deltas = new Map()
    for (const group of byKey.values()) {
      const sorted = [...group].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      sorted.forEach((item, i) => {
        deltas.set(item.id, i === 0 ? null : item.score - sorted[i - 1].score)
      })
    }
    return enriched.map(item => ({ ...item, scoreDelta: deltas.get(item.id) ?? null }))
  }, [enriched])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return enrichedWithDelta.filter(item => {
      const verdict = item.result?.overall_verdict || item.result?.recruiter_shortlist?.verdict || ''
      const tone = scoreTone(item.score)
      const matchFilter = filter === 'all' || filter === verdict || filter === tone || filter === getPipelineStatus(item)
      const haystack = `${item.display.title} ${item.display.company} ${item.display.location} ${item.display.contract} ${item.display.workMode} ${item.job_url || ''} ${getStatusLabel(getPipelineStatus(item), t)}`.toLowerCase()
      return matchFilter && (!query || haystack.includes(query))
    }).sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score
      if (sortBy === 'company') return (a.display.company || a.display.title).localeCompare(b.display.company || b.display.title)
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [enrichedWithDelta, search, filter, sortBy])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visibleRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [search, filter, sortBy])
  useEffect(() => {
    if (!selectedId && filtered[0]?.id) setSelectedId(filtered[0].id)
    if (selectedId && filtered.length && !filtered.some(item => item.id === selectedId)) setSelectedId(filtered[0].id)
  }, [filtered, selectedId])

  const selected = filtered.find(item => item.id === selectedId) || filtered[0] || null
  const selectedScore = selected?.score || 0
  const selectedTone = scoreTone(selectedScore)
  const selectedResult = selected?.result || {}
  const selectedDisplay = selected?.display || {}
  const { foundKeywords, missingKeywords, quickWins, gaps, met, unmet } = getHistoryLists(selectedResult)

  const filters = [
    { value: 'all', label: t('dash_filter_all', 'All') }, { value: 'strong', label: t('dash_filter_strong', 'Strong') }, { value: 'medium', label: t('dash_filter_medium', 'Medium') }, { value: 'weak', label: t('dash_filter_weak', 'Needs work') }
  ]

  return (
    <div className="historyMD-page page-enter">
      <main className="historyMD-shell">
        <section className="historyMD-hero"><div><p className="historyMD-kicker">{t('dash_history_kicker', 'History')}</p><h1>{t('history_saved_title', 'Your saved analyses')}</h1><span>{t('history_saved_intro', 'Review previous job analyses quickly, compare scores, and reopen the full report only when needed.')}</span></div><div className="historyMD-actions"><button type="button" className="historyMD-primary" onClick={onNewAnalysis}>+ {t('history_new_check', 'New analysis')}</button>{analyses.length > 0 && <button type="button" className="historyMD-ghost historyMD-danger" onClick={() => setDeleteAllOpen(true)}>{t('history_delete_all', 'Delete all')}</button>}</div></section>

        {!loading && analyses.length > 0 && <PipelineBar counts={pipelineCounts} filter={filter} onFilter={setFilter} t={t} />}

        {!loading && analyses.length > 0 && <section className="historyMD-stats"><StatCard icon="T" label={t('pipeline_stat_total', 'Total analyses')} value={stats.total} helper={t('pipeline_stat_total_helper', 'Saved reports')} /><StatCard icon="A" label={t('pipeline_stat_active', 'Active applications')} value={pipelineCounts.applied + pipelineCounts.interview} helper={t('pipeline_stat_active_helper', 'Applied + interview')} /><StatCard icon="I" label={t('pipeline_stat_interviews', 'Interviews')} value={pipelineCounts.interview} helper={t('pipeline_stat_interviews_helper', 'In interview stage')} /><StatCard icon="O" label={t('pipeline_stat_offers', 'Offers')} value={pipelineCounts.offer} helper={t('pipeline_stat_offers_helper', 'Offers received')} /></section>}

        <section className="historyMD-card historyMD-master">
          <div className="historyMD-masterHead"><div><p className="historyMD-kicker">{t('dash_saved_analyses_kicker', 'Saved analyses')}</p><h2>{filtered.length === 1 ? t('dash_result_one', { n: filtered.length }, '{n} result') : t('dash_result_many', { n: filtered.length }, '{n} results')}</h2></div><div className="historyMD-toolbar"><label className="historyMD-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('dash_search_placeholder', 'Search by job, company, location or status...')} /></label><select value={sortBy} onChange={event => setSortBy(event.target.value)}><option value="recent">{t('dash_sort_newest', 'Newest')}</option><option value="score">{t('dash_sort_score', 'Highest score')}</option><option value="company">{t('dash_sort_company', 'Company A-Z')}</option></select></div></div>
          {!loading && analyses.length > 0 && <div className="historyMD-filters">{filters.map(item => <button key={item.value} type="button" className={filter === item.value ? 'is-active' : ''} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>}
          {loading && <div className="historyMD-skeletonList">{[1,2,3,4].map(item => <span key={item} />)}</div>}
          {!loading && fetchError && <EmptyState title={t('history_load_error', 'Could not load analyses')} text={t('history_load_error_desc', 'There was a problem fetching your data. Check your connection and try again.')} action={t('history_retry', 'Try again')} onAction={fetchAnalyses} />}
          {!loading && !fetchError && analyses.length === 0 && <EmptyState title={t('history_no_analyses', 'No analyses yet')} text={t('history_no_analyses_desc', 'Run your first job analysis and it will appear here.')} action={t('history_start_analyzing', 'Start analyzing')} onAction={onNewAnalysis} />}
          {!loading && analyses.length > 0 && filtered.length === 0 && <EmptyState title={t('history_no_filter_match', 'No matching analyses')} text={t('history_try_filter', 'Try another search or filter.')} />}
          {!loading && filtered.length > 0 && <><div className="historyMD-tableWrap"><table className="historyMD-table"><thead><tr><th>{t('dash_th_job', 'Job title')}</th><th>{t('dash_th_company', 'Company')}</th><th>{t('dash_th_score', 'Fit score')}</th><th>{t('dash_th_verdict', 'Verdict')}</th><th>{t('dash_th_status', 'Status')}</th><th>{t('dash_th_date', 'Date')}</th><th>{t('dash_th_actions', 'Actions')}</th></tr></thead><tbody>{visibleRows.map(item => { const tone = scoreTone(item.score); const active = selected?.id === item.id; return <tr key={item.id} className={active ? 'is-selected' : ''} onClick={() => setSelectedId(item.id)}><td><strong>{item.display.title}</strong><span>{item.display.location || item.display.workMode || item.display.contract || t('dash_row_saved_analysis', 'Saved analysis')}</span>{getPipelineStatus(item) === 'applied' && daysSince(item.status_updated_at) >= 7 && <FollowUpNudge analysis={item} days={daysSince(item.status_updated_at)} onGenerateMessage={onGenerateMessage} t={t} small />}{getPipelineStatus(item) === 'interview' && <InterviewHint analysis={item} onSelectAnalysis={onSelectAnalysis} t={t} small />}</td><td>{item.display.company || '—'}</td><td><b className={`historyMD-score historyMD-score--${tone}`}>{item.score}%</b>{item.scoreDelta !== null && item.scoreDelta !== 0 && <small style={{color:item.scoreDelta>0?'#10b981':'#ef4444',marginLeft:4,fontWeight:700}}>{item.scoreDelta>0?'+':''}{item.scoreDelta}</small>}</td><td><em className={`historyMD-verdict historyMD-verdict--${tone}`}>{verdictLabel(item.result?.overall_verdict || item.result?.recruiter_shortlist?.verdict, t)}</em></td><td><StatusPill analysis={item} onUpdate={updated => setAnalyses(prev => prev.map(row => row.id === updated.id ? updated : row))} compact /></td><td><span>{formatDate(item.created_at, lang)}</span><small>{formatTime(item.created_at, lang)}</small></td><td><button type="button" onClick={event => { event.stopPropagation(); onSelectAnalysis?.(item) }}>{t('dash_open', 'Open')}</button><button type="button" className="historyMD-deleteBtn" disabled={deleting === item.id} onClick={event => deleteAnalysis(item.id, event)}>×</button></td></tr> })}</tbody></table></div><div className="historyMD-pagination"><span>{t('dash_showing', { from: (safePage - 1) * PAGE_SIZE + 1, to: Math.min(safePage * PAGE_SIZE, filtered.length), total: filtered.length }, 'Showing {from}-{to} of {total}')}</span><div><button type="button" disabled={safePage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button><strong>{safePage}</strong><button type="button" disabled={safePage >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>›</button></div></div></>}
        </section>

        {!loading && selected && <section className="historyMD-card historyMD-detail"><div className="historyMD-detailHeader"><div><p className="historyMD-kicker">{t('dash_selected_analysis', 'Selected analysis')}</p><h2>{selectedDisplay.title}</h2><span>{selectedDisplay.company || t('dash_company_unspecified', 'Company not specified')} · {formatDate(selected.created_at, lang)} {formatTime(selected.created_at, lang)}</span></div><div className={`historyMD-detailScore historyMD-detailScore--${selectedTone}`}><strong>{selectedScore}%</strong><span>{verdictLabel(selectedResult.overall_verdict || selectedResult.recruiter_shortlist?.verdict, t)}</span></div></div><div className="historyMD-detailGrid"><article className="historyMD-detailSummary"><p>{selectedDisplay.summary || selectedResult.match_reasoning || t('dash_no_summary', 'No summary returned for this analysis.')}</p><div className="historyMD-miniFacts"><span><b>{t('dash_work_mode', 'Work mode')}</b>{selectedDisplay.workMode || t('dash_not_set', 'Not set')}</span><span><b>{t('dash_contract', 'Contract')}</b>{selectedDisplay.contract || t('dash_not_set', 'Not set')}</span><span><b>{t('dash_salary', 'Salary')}</b>{selectedDisplay.salary || t('dash_not_stated', 'Not stated')}</span><span><b>{t('dash_status', 'Status')}</b>{getStatusLabel(getPipelineStatus(selected), t)}</span></div>{getPipelineStatus(selected) === 'applied' && daysSince(selected.status_updated_at) >= 7 && <FollowUpNudge analysis={selected} days={daysSince(selected.status_updated_at)} onGenerateMessage={onGenerateMessage} t={t} />}{getPipelineStatus(selected) === 'interview' && <InterviewHint analysis={selected} onSelectAnalysis={onSelectAnalysis} t={t} />}{(selectedDisplay.recruiterReason || selectedDisplay.nextAction) && <div className="historyMD-recruiterBox"><strong>{t('dash_recruiter_summary', 'Recruiter screening summary')}</strong><p>{selectedDisplay.recruiterReason || selectedDisplay.nextReason || t('dash_review_proof', 'Review the missing proof points before applying.')}</p></div>}</article><div className="historyMD-keywordPanel"><strong>{t('missing_keywords', 'Missing keywords')}</strong><div>{missingKeywords.length ? missingKeywords.map(item => <span key={item}>{item}</span>) : <p>{t('dash_no_missing_kw', 'No missing keywords returned.')}</p>}</div><strong>{t('dash_found_in_cv', 'Found in CV')}</strong><div>{foundKeywords.length ? foundKeywords.map(item => <span key={item} className="is-found">{item}</span>) : <p>{t('dash_no_found_kw', 'No found keywords returned.')}</p>}</div></div></div><div className="historyMD-lists"><DetailList title={t('dash_quick_wins', 'Quick wins')} items={quickWins} empty={t('dash_no_quick_wins', 'No quick wins returned.')} tone="good" /><DetailList title={t('dash_gaps', 'Gaps to address')} items={gaps} empty={t('dash_no_gaps', 'No major gaps returned.')} tone="bad" /><DetailList title={t('dash_req_met', 'Requirements met')} items={met} empty={t('dash_no_req_met', 'No met requirements returned.')} tone="good" /><DetailList title={t('dash_req_missing', 'Requirements missing')} items={unmet} empty={t('dash_no_req_missing', 'No missing requirements returned.')} tone="bad" /></div><div className="historyMD-detailActions"><button type="button" className="historyMD-primary" onClick={() => onSelectAnalysis?.(selected)}>{t('dash_open_full', 'Open full analysis')}</button><button type="button" className="historyMD-ghost" onClick={onNewAnalysis}>{t('dash_rerun', 'Re-run analysis')}</button><button type="button" className="historyMD-ghost" onClick={() => onBuildCv?.(selected)} disabled={!onBuildCv}>{t('dash_gen_cv', 'Generate tailored CV')}</button><button type="button" className="historyMD-ghost" onClick={() => onGenerateMessage?.(selected)} disabled={!onGenerateMessage}>{t('dash_gen_msg', 'Generate message')}</button></div></section>}
      </main>
      {deleteAllOpen && <DeleteAllModal count={analyses.length} onConfirm={handleDeleteAll} onClose={() => setDeleteAllOpen(false)} />}
    </div>
  )
}
