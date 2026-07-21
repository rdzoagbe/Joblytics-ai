import React, { useState, useEffect } from 'react'
import NextStepsCard from './NextStepsCard'
import SalaryInsightCard from './SalaryInsightCard'
import SeniorityCard from './SeniorityCard'
import SmartApplyBtn from './SmartApplyBtn'
import InterviewPrepCard from './InterviewPrepCard'
import CvCoachPreview from './CvCoachPreview'
import StatusPill from './StatusPill'
import WaitlistBanner from './WaitlistBanner'
import { useLang } from '../context/LangContext'
import { cleanLabels, isDegradedAnalysis } from '../utils/displayFilters'

const premium = {
  ivory: '#FAF7F1',
  paper: '#FFFDF8',
  navy: '#10182B',
  muted: '#5F6472',
  line: 'rgba(16,24,43,0.12)',
  copper: '#B5663C',
  copperSoft: 'rgba(181,102,60,0.10)',
  green: '#557C64',
  red: '#B85C55',
  gold: '#B9863B',
  blue: '#516483',
  purple: '#7B61B8'
}

// Display-only formatter for skill/keyword chips coming from the engine in
// lowercase ("aws", "gestion de projet"). Uppercases known acronyms and
// capitalizes the first letter of other words. String in, string out.
const SKILL_ACRONYMS = new Set(['aws', 'gcp', 'sql', 'api', 'ci/cd', 'etl', 'seo', 'kpi', 'crm', 'sso', 'saml', 'mfa', 'mdm', 'iam', 'itil', 'vpn', 'dns', 'ux', 'ui', 'ai', 'bi', 'hr'])

export function formatSkillLabel(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return raw
  const words = raw.split(/\s+/).map(word => {
    const lower = word.toLowerCase()
    if (SKILL_ACRONYMS.has(lower)) return lower.toUpperCase()
    return word
  })
  const result = words.join(' ')
  // Capitalize only the first letter of the phrase, preserving the rest as-is.
  return result.charAt(0).toUpperCase() + result.slice(1)
}

function safeArray(value, limit = 8) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : []
}

function unique(items = [], limit = 8) {
  return [...new Set(items.filter(Boolean).map(item => String(item).trim()).filter(Boolean))].slice(0, limit)
}

function safeScore(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(value, 10)
  if (Number.isNaN(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

function scoreLabel(score, verdict, t) {
  if (verdict) return String(verdict).replace(/_/g, ' ').toUpperCase()
  if (score >= 75) return t('rv_verdict_likely_passed', 'LIKELY PASSED')
  if (score >= 55) return t('rv_verdict_borderline', 'BORDERLINE')
  return t('rv_verdict_needs_work', 'NEEDS WORK')
}

function formatDate(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  } catch {
    return ''
  }
}

function scoreTone(score) {
  if (score >= 75) return premium.green
  if (score >= 55) return premium.gold
  return premium.red
}

function Tag({ label, type = 'found' }) {
  const styles = {
    found: { bg: 'rgba(85,124,100,0.12)', color: premium.green, border: 'rgba(85,124,100,0.24)' },
    missing: { bg: 'rgba(184,92,85,0.10)', color: premium.red, border: 'rgba(184,92,85,0.22)' },
    neutral: { bg: 'rgba(181,102,60,0.09)', color: premium.copper, border: 'rgba(181,102,60,0.20)' }
  }
  const s = styles[type] || styles.found
  return <span style={{ fontSize: 11, padding: '6px 10px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, display: 'inline-block', margin: '3px 4px 3px 0', fontWeight: 850 }}>{formatSkillLabel(label)}</span>
}

function InfoPill({ label, value }) {
  const { t } = useLang()
  return (
    <div style={{ border: `1px solid ${premium.line}`, borderRadius: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.52)', minHeight: 50, minWidth: 0 }}>
      <p style={{ margin: '0 0 6px', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: premium.copper, fontWeight: 950 }}>{label}</p>
      <strong style={{ display: 'block', color: premium.navy, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || t('rv_not_stated', 'Not stated')}</strong>
    </div>
  )
}

function BulletList({ items, tone = 'good', empty, max = 5 }) {
  const color = tone === 'bad' ? premium.red : premium.green
  return items?.length ? (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.slice(0, max).map((item, index) => (
        <div key={`${item}-${index}`} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <span style={{ color, fontSize: 16, lineHeight: '14px' }}>•</span>
          <p style={{ margin: 0, color: premium.muted, fontSize: 12, lineHeight: 1.45 }}>{item}</p>
        </div>
      ))}
    </div>
  ) : <p style={{ margin: 0, color: tone === 'bad' ? premium.green : premium.muted, fontSize: 12, lineHeight: 1.5 }}>{empty}</p>
}

function SummaryCard({ title, children }) {
  return (
    <section style={{ border: `1px solid ${premium.line}`, borderRadius: 20, padding: 16, background: premium.paper, minHeight: 132, minWidth: 0 }}>
      <h3 style={{ margin: '0 0 14px', color: premium.navy, fontSize: 14, fontWeight: 950 }}>{title}</h3>
      {children}
    </section>
  )
}

// Collapsible group wrapper. Open/closed state is in-memory only.
function Section({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section style={{ border: `1px solid ${premium.line}`, borderRadius: 22, background: premium.paper, marginBottom: 14, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ color: premium.navy, fontSize: 15, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {typeof count === 'number' && count > 0 && (
            <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 900, color: premium.copper, background: premium.copperSoft, border: '1px solid rgba(181,102,60,0.20)', borderRadius: 999, padding: '2px 9px' }}>{count}</span>
          )}
        </span>
        <span aria-hidden="true" style={{ flexShrink: 0, color: premium.copper, fontSize: 13, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>▾</span>
      </button>
      {open && <div style={{ padding: '0 18px 18px' }}>{children}</div>}
    </section>
  )
}

function ScoreMathCard({ breakdown, penalty, explanation, total }) {
  const { t } = useLang()
  if (!Array.isArray(breakdown) || !breakdown.length) return null
  const score = safeScore(total, 0)
  return (
    <section style={{ border: `1px solid ${premium.line}`, borderRadius: 20, padding: 18, background: 'rgba(255,255,255,0.5)', marginTop: 14 }}>
      <h3 style={{ margin: '0 0 4px', color: premium.navy, fontSize: 15, fontWeight: 950 }}>{t('rv_score_calc_title', 'How this score is calculated')}</h3>
      {explanation && <p style={{ margin: '0 0 12px', color: premium.muted, fontSize: 12.5, lineHeight: 1.55 }}>{explanation}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {breakdown.map(factor => {
          const sub = safeScore(factor.score, 0)
          const tone = scoreTone(sub)
          return (
            <div key={factor.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ color: premium.navy, fontSize: 12.5, fontWeight: 700 }}>{factor.label}</span>
                  <span style={{ color: premium.muted, fontSize: 11.5 }}>{sub}% × {factor.weight}% = <strong style={{ color: premium.navy }}>{factor.points}</strong> pts</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'rgba(16,24,43,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${sub}%`, height: '100%', background: tone }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {penalty > 0 && (
        <p style={{ margin: '10px 0 0', color: premium.red, fontSize: 12 }}>
          − {penalty} {t('rv_score_penalty_suffix', 'pts penalty for missing several critical skills')}
        </p>
      )}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${premium.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: premium.navy, fontSize: 13, fontWeight: 950 }}>{t('rv_final_ats_score', 'Final ATS score')}</span>
        <strong style={{ color: scoreTone(score), fontSize: 18 }}>{score}%</strong>
      </div>
    </section>
  )
}

function RequirementsCoverageCard({ items, proofGaps }) {
  const { t } = useLang()
  const rows = (Array.isArray(items) ? items : [])
    .filter(r => r && typeof r === 'object' && String(r.requirement || '').trim())
    .slice(0, 10)
  if (!rows.length) return null

  const meta = {
    met: { label: t('rv_status_met', 'Met'), color: premium.green, bg: 'rgba(85,124,100,0.10)' },
    partial: { label: t('rv_status_partial', 'Partial'), color: premium.gold, bg: 'rgba(185,134,59,0.12)' },
    missing: { label: t('rv_status_missing', 'Missing'), color: premium.red, bg: 'rgba(184,92,85,0.10)' }
  }
  const proof = (Array.isArray(proofGaps) ? proofGaps : []).map(p => String(p || '').trim()).filter(Boolean).slice(0, 4)

  return (
    <section style={{ border: `1px solid ${premium.line}`, borderRadius: 20, padding: 18, background: premium.paper, marginTop: 14 }}>
      <h3 style={{ margin: '0 0 4px', color: premium.navy, fontSize: 15, fontWeight: 950 }}>{t('rv_req_coverage_title', 'Requirements coverage')}</h3>
      <p style={{ margin: '0 0 12px', color: premium.muted, fontSize: 12.5, lineHeight: 1.55 }}>
        {t('rv_req_coverage_desc', "Each key requirement from the job, whether your CV shows it, and a truthful way to strengthen it — never claim what you haven't done.")}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r, i) => {
          const m = meta[String(r.status || '').toLowerCase()] || meta.missing
          const evidence = String(r.evidence || '').trim()
          const suggestion = String(r.suggestion || '').trim()
          return (
            <div key={`req-${i}`} style={{ borderTop: i ? `1px solid ${premium.line}` : 'none', paddingTop: i ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', color: m.color, background: m.bg, border: `1px solid ${m.color}40`, borderRadius: 999, padding: '3px 9px', marginTop: 1 }}>{m.label}</span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, color: premium.navy, fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{r.requirement}</p>
                  {evidence && <p style={{ margin: '3px 0 0', color: premium.muted, fontSize: 12, lineHeight: 1.5 }}><strong style={{ color: premium.green }}>{t('rv_your_evidence', 'Your evidence:')}</strong> {evidence}</p>}
                  {suggestion && <p style={{ margin: '3px 0 0', color: premium.muted, fontSize: 12, lineHeight: 1.5 }}><strong style={{ color: premium.copper }}>{t('rv_how_to_strengthen', 'How to strengthen:')}</strong> {suggestion}</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {proof.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${premium.line}` }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 850, letterSpacing: '0.05em', textTransform: 'uppercase', color: premium.copper }}>{t('rv_proof_to_add', 'Proof to add')}</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: premium.muted, fontSize: 12, lineHeight: 1.6 }}>
            {proof.map((p, i) => <li key={`proof-${i}`}>{p}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}

function ImprovementPlanCard({ plan }) {
  const { t } = useLang()
  if (!plan || !Array.isArray(plan.addressable_skills) || !plan.addressable_skills.length) return null
  const current = safeScore(plan.current_score, 0)
  const considered = plan.to_considered
  const interview = plan.to_interview
  const alreadyInterview = !interview // null means already at/above the interview threshold

  const Step = ({ tone, label, target, info }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: `1px solid ${premium.line}` }}>
      <div style={{ width: 52, flexShrink: 0, textAlign: 'center' }}>
        <strong style={{ color: tone, fontSize: 18 }}>{target}</strong>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: premium.muted }}>{t('rv_plan_target', 'target')}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: '0 0 3px', color: premium.navy, fontSize: 13, fontWeight: 800 }}>{label}</p>
        <p style={{ margin: 0, color: premium.muted, fontSize: 12, lineHeight: 1.5 }}>{info}</p>
      </div>
    </div>
  )

  const skillList = skills => skills.map(s => <Tag key={`plan-${s}`} label={s} type="missing" />)

  return (
    <section style={{ border: `1px solid ${premium.line}`, borderRadius: 20, padding: 18, background: premium.copperSoft, marginTop: 14 }}>
      <h3 style={{ margin: '0 0 4px', color: premium.navy, fontSize: 15, fontWeight: 950 }}>{t('rv_plan_title', 'Your path to an interview')}</h3>
      <p style={{ margin: '0 0 6px', color: premium.muted, fontSize: 12.5, lineHeight: 1.55 }}>
        {t('rv_plan_desc_pre', "You're at ")}<strong style={{ color: premium.navy }}>{current}%</strong>{t('rv_plan_desc_post', " today. Here's what evidencing more of the role's skills on your CV would do to your score — using the same scoring engine, so these projections are real.")}
      </p>

      {considered && considered.reachable && (
        <Step tone={premium.gold} target={`${considered.projected_score}%`}
          label={`${t('rv_plan_considered_label', 'Get considered — evidence')} ${considered.skills_needed} ${considered.skills_needed > 1 ? t('rv_skills', 'skills') : t('rv_skill', 'skill')}`}
          info={t('rv_plan_considered_info', 'Crosses the threshold where an ATS/recruiter is likely to keep reading rather than auto-filter.')} />
      )}
      {interview && interview.reachable && (
        <Step tone={premium.green} target={`${interview.projected_score}%`}
          label={`${t('rv_plan_interview_label', 'Become interview-likely — evidence')} ${interview.skills_needed} ${interview.skills_needed > 1 ? t('rv_skills', 'skills') : t('rv_skill', 'skill')}`}
          info={t('rv_plan_interview_info', 'Comfortably clears the filter for most ATS-screened roles.')} />
      )}
      {interview && !interview.reachable && (
        <Step tone={premium.red} target={`~${interview.projected_score}%`}
          label={t('rv_plan_unreachable_label', "Skills alone won't reach interview-likely")}
          info={t('rv_plan_unreachable_info', 'Even evidencing every missing skill caps out below the interview bar — the remaining gap is depth of experience or seniority for this role, not keywords.')} />
      )}
      {alreadyInterview && (
        <Step tone={premium.green} target={`${current}%`}
          label={t('rv_plan_already_label', "You're already interview-likely")}
          info={t('rv_plan_already_info', 'Your score clears the typical ATS filter. Focus on tailoring and interview prep rather than the score.')} />
      )}

      <div style={{ marginTop: 12 }}>
        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 850, letterSpacing: '0.05em', textTransform: 'uppercase', color: premium.copper }}>
          {t('rv_plan_skills_to_evidence', 'Skills to evidence (only if you genuinely have them)')}
        </p>
        <div>{skillList(plan.addressable_skills.slice(0, 10))}</div>
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: premium.muted, lineHeight: 1.5, fontStyle: 'italic' }}>
          {t('rv_plan_skills_note', "Add concrete proof — projects, results, tools used — for any of these you've actually done. Never claim skills you don't have; recruiters verify in interviews.")}
        </p>
      </div>
    </section>
  )
}

function ScoreBreakdownCard({ label, score, helper, color }) {
  const s = safeScore(score, 0)
  const tone = color || scoreTone(s)
  return (
    <article style={{ border: `1px solid ${premium.line}`, borderRadius: 18, padding: 15, background: 'rgba(255,255,255,0.54)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 58, height: 58, borderRadius: '50%', border: `6px solid ${tone}`, background: 'rgba(255,255,255,0.6)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <strong style={{ color: tone, fontSize: 15 }}>{s}%</strong>
        </div>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ margin: '0 0 5px', color: premium.navy, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</h4>
          <p style={{ margin: 0, color: premium.muted, fontSize: 12, lineHeight: 1.45 }}>{helper}</p>
        </div>
      </div>
    </article>
  )
}

function LanguageMismatchBanner({ languageCheck, onReset }) {
  const { t } = useLang()
  if (!languageCheck?.mismatch) return null
  const jobLabel = languageCheck.job?.label
  const cvLabel = languageCheck.cv?.label
  if (!jobLabel || !cvLabel) return null

  return (
    <div style={{ background: 'rgba(185,134,59,0.08)', border: '1px solid rgba(185,134,59,0.22)', borderRadius: 18, padding: '14px 16px', marginBottom: 12, display: 'flex', gap: 10 }}>
      <span style={{ color: premium.gold, flexShrink: 0 }}>⚠</span>
      <div>
        <p style={{ fontSize: 10, fontWeight: 900, color: premium.gold, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>{t('rv_lang_mismatch_title', 'Language mismatch detected')}</p>
        <p style={{ fontSize: 12, color: premium.muted, lineHeight: 1.5, margin: 0 }}>
          {t('rv_lang_mismatch_p1', "This job offer looks like it's written in ")}{jobLabel}{t('rv_lang_mismatch_p2', ", but your CV looks like it's in ")}{cvLabel}{t('rv_lang_mismatch_p3', '. Keyword matching is language-sensitive, so this score may be less accurate. For a more reliable result, re-run the analysis with a ')}{jobLabel}{t('rv_lang_mismatch_p4', ' version of your CV.')}
        </p>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            style={{
              marginTop: 10, padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${premium.gold}`, background: 'rgba(185,134,59,0.12)',
              color: premium.gold, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.02em'
            }}
          >
            {t('rv_analyze_with_cv_pre', 'Analyze with a ')}{jobLabel}{t('rv_analyze_with_cv_suf', ' CV →')}
          </button>
        )}
      </div>
    </div>
  )
}

function JobDetailsCard({ data }) {
  const { t } = useLang()
  const sections = data.job_sections || {}
  const context = data.job_context || {}
  const hiringContact = context.hiring_contact && !['null', 'not mentioned', 'not stated', 'n/a'].includes(String(context.hiring_contact).toLowerCase().trim()) ? context.hiring_contact : null
  const experienceRequired = context.experience_required && !['null', 'not stated', 'not specified'].includes(String(context.experience_required).toLowerCase().trim()) ? context.experience_required : null
  const aboutCompany = sections.about_company && sections.about_company !== 'null' ? sections.about_company : null
  const aboutRole = sections.about_role && sections.about_role !== 'null' ? sections.about_role : null
  const responsibilities = safeArray(sections.key_responsibilities, 4)
  const requirements = safeArray(sections.key_requirements, 4)
  const benefits = sections.benefits && sections.benefits !== 'null' ? sections.benefits : null
  const hasAny = hiringContact || experienceRequired || aboutCompany || aboutRole || responsibilities.length || requirements.length || benefits
  if (!hasAny) return null

  return (
    <section style={{ border: `1px solid ${premium.line}`, borderRadius: 20, padding: '18px 20px', background: premium.paper, marginBottom: 16 }}>
      <p style={{ margin: '0 0 14px', fontSize: 10, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', color: premium.copper }}>{t('rv_about_this_role', 'About this role')}</p>
      {(hiringContact || experienceRequired) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: aboutCompany || aboutRole || responsibilities.length || requirements.length ? 14 : 0 }}>
          {hiringContact && <InfoPill label={t('rv_hiring_contact', 'Hiring contact')} value={hiringContact} />}
          {experienceRequired && <InfoPill label={t('rv_experience_required', 'Experience required')} value={experienceRequired} />}
        </div>
      )}
      <div className="rvx-grid-2">
        {aboutCompany && <SummaryCard title={t('rv_about_company', 'About the company')}><p style={{ margin: 0, fontSize: 12, color: premium.muted, lineHeight: 1.55 }}>{aboutCompany}</p></SummaryCard>}
        {aboutRole && <SummaryCard title={t('rv_the_role', 'The role')}><p style={{ margin: 0, fontSize: 12, color: premium.muted, lineHeight: 1.55 }}>{aboutRole}</p></SummaryCard>}
        {responsibilities.length > 0 && <SummaryCard title={t('rv_key_responsibilities', 'Key responsibilities')}><BulletList items={responsibilities} tone="good" empty="" max={4} /></SummaryCard>}
        {requirements.length > 0 && <SummaryCard title={t('rv_key_requirements', 'Key requirements')}><BulletList items={requirements} tone="good" empty="" max={4} /></SummaryCard>}
        {benefits && <SummaryCard title={t('rv_benefits', 'Benefits')}><p style={{ margin: 0, fontSize: 12, color: premium.muted, lineHeight: 1.55 }}>{benefits}</p></SummaryCard>}
      </div>
    </section>
  )
}

// Derives everything the hero and the sections need from the raw analysis payload.
function deriveSummary(data, savedRow, t) {
  const context = data.job_context || {}
  const recruiter = data.recruiter_shortlist || {}
  const keyword = data.keyword_match || {}
  const req = data.requirements_check || {}
  const strict = data.strict_ats_result || {}
  const strictAnalysis = strict.analysis || {}
  const strictMatched = safeArray(strictAnalysis.matched_skills, 12)
  const cleanKeywords = data.keywords_analysis || {}
  const cleanReq = data.requirements_analysis || {}
  const semantic = data.semantic_fit || {}
  const seniority = data.seniority_fit || data.seniority || {}

  const score = safeScore(data.display_score ?? data.match_probability, 0)
  const tone = scoreTone(score)
  const title = context.job_title || context.title || data.job_title || t('selected_analysis_fallback_title', 'Selected analysis')
  const company = context.company && !['Not specified', 'Not stated'].includes(context.company) ? context.company : null
  const analyzedAt = formatDate(savedRow?.created_at || data.created_at)
  const subtitle = [company, analyzedAt].filter(Boolean).join(' · ')
  const summary = context.job_summary || data.job_summary || data.match_reasoning || recruiter.reason || t('rv_summary_fallback', 'Joblytics analyzed the job description against the current CV and extracted the strongest ATS signals.')

  const confidenceLevel = String(data.confidence?.level || '').toLowerCase()
  const confidence = ['high', 'medium', 'low'].includes(confidenceLevel)
    ? { level: confidenceLevel, color: confidenceLevel === 'high' ? premium.green : confidenceLevel === 'medium' ? premium.gold : '#B85C55' }
    : null

  const missingKeywords = cleanLabels(unique([...(cleanKeywords.missing_keywords || []), ...(keyword.missing_required || []), ...(strictAnalysis.missing_skills || [])], 10))
  const foundKeywords = cleanLabels(unique([...(cleanKeywords.found_in_cv || []), ...(keyword.found || []), ...strictMatched.map(item => item.required_skill)], 12))
  // Quick wins are templated from keywords ("Add truthful evidence for X"), so drop
  // any line built from a URL/junk fragment before it reaches the user as advice.
  const quickWins = safeArray(data.quick_wins, 8).filter(line => cleanLabels([line]).length).slice(0, 5)
  const gaps = cleanLabels(unique([...(data.gaps_to_address || []), ...(data.critical_gaps || []), ...(cleanReq.requirements_missing || []), ...(strictAnalysis.needs_proof || [])], 8)).slice(0, 6)
  const met = cleanLabels(unique([...(cleanReq.requirements_met || []), ...(req.met || []), ...strictMatched.map(item => item.required_skill)], 8)).slice(0, 6)
  const unmet = cleanLabels(unique([...(cleanReq.requirements_missing || []), ...(req.unmet || []), ...(strictAnalysis.missing_skills || [])], 8)).slice(0, 6)
  const salaryText = context.salary || context.salary_range || data.salary_assessment?.assessment || t('rv_not_stated', 'Not stated')
  const statusText = savedRow ? t('rv_status_saved', 'Saved') : t('rv_status_ready', 'Ready to save')
  const recruiterSummary = data.recruiter_screening_summary || recruiter.reason || data.overall_reason || t('rv_recruiter_summary_fallback', 'Use this result to decide what to fix before applying.')

  const keywordScore = safeScore(keyword.score, foundKeywords.length || missingKeywords.length ? Math.round((foundKeywords.length / Math.max(1, foundKeywords.length + missingKeywords.length)) * 100) : score)
  const experienceScore = safeScore(req.score ?? data.experience_depth?.score, score)
  const semanticScore = safeScore(semantic.score, score)
  const seniorityScore = safeScore(seniority.score, score)
  const recruiterScore = safeScore(recruiter.probability, score)

  // Top 3 actions for the hero: prefer 'missing' requirements from coverage,
  // then gaps to address, then quick wins.
  const coverageMissing = (Array.isArray(data.requirements_coverage) ? data.requirements_coverage : [])
    .filter(r => r && typeof r === 'object' && String(r.status || '').toLowerCase() === 'missing' && String(r.requirement || '').trim())
    .map(r => String(r.suggestion || '').trim() || String(r.requirement).trim())
  const topActions = unique([...coverageMissing.slice(0, 3), ...gaps, ...quickWins], 12).slice(0, 3)

  return {
    context, score, tone, title, company, subtitle, summary, confidence,
    missingKeywords, foundKeywords, quickWins, gaps, met, unmet,
    salaryText, statusText, recruiterSummary,
    keywordScore, experienceScore, semanticScore, seniorityScore, recruiterScore,
    topActions
  }
}

// First viewport: score + verdict, top 3 actions, one primary CTA.
function HeroSummary({ data, summary, t, onGoCoach }) {
  const { score, tone, title, subtitle, confidence, topActions, context } = summary
  return (
    <section style={{ marginBottom: 16, padding: 24, borderRadius: 28, background: premium.paper, border: `1px solid ${premium.line}`, boxShadow: '0 24px 70px rgba(16,24,43,0.08)' }}>
      <div className="rvx-hero-head" style={{ borderBottom: `1px solid ${premium.line}`, paddingBottom: 18 }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <p style={{ margin: 0, color: premium.copper, fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{t('selected_analysis', 'Selected analysis')}</p>
          <h1 style={{ margin: '7px 0 6px', color: premium.navy, fontFamily: 'Georgia, Newsreader, serif', fontSize: 'clamp(26px,4vw,44px)', lineHeight: 1.05, letterSpacing: '-0.045em', fontWeight: 500, overflowWrap: 'break-word' }}>{title}</h1>
          {subtitle && <p style={{ margin: 0, color: premium.muted, fontSize: 12 }}>{subtitle}</p>}
          {confidence && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9,
              padding: '4px 10px', borderRadius: 999, background: `${confidence.color}1A`,
              border: `1px solid ${confidence.color}55`, color: confidence.color,
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: confidence.color }} />
              {t(`confidence_${confidence.level}`, `${confidence.level} confidence`)}
            </span>
          )}
        </div>
        <div className="rvx-ring" style={{ borderColor: tone, background: score >= 75 ? 'rgba(85,124,100,0.10)' : score >= 55 ? 'rgba(185,134,59,0.10)' : 'rgba(184,92,85,0.10)' }}>
          <div style={{ textAlign: 'center' }}>
            <strong className="rvx-ring-score" style={{ display: 'block', fontFamily: 'Georgia, Newsreader, serif', color: tone, lineHeight: 1 }}>{score}%</strong>
            <span style={{ display: 'block', marginTop: 5, color: tone, fontSize: 9, fontWeight: 950, letterSpacing: '0.07em' }}>{scoreLabel(score, data.overall_verdict, t)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase', color: premium.copper }}>
          {topActions.length ? t('rv_hero_top_actions', 'Top 3 actions') : t('rv_hero_verdict_kicker', 'Where you stand')}
        </p>
        {topActions.length ? (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
            {topActions.map((action, i) => (
              <li key={`hero-action-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 21, height: 21, borderRadius: '50%', background: premium.copperSoft, border: '1px solid rgba(181,102,60,0.24)', color: premium.copper, fontSize: 11, fontWeight: 950, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
                <p style={{ margin: 0, color: premium.navy, fontSize: 13, lineHeight: 1.5, fontWeight: 600 }}>{action}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ margin: 0, color: premium.green, fontSize: 13, lineHeight: 1.5, fontWeight: 600 }}>
            {t('rv_hero_no_actions', 'No critical fixes detected — you can apply with confidence.')}
          </p>
        )}
      </div>

      <div className="rvx-hero-cta" style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {onGoCoach && (
          <button
            type="button"
            onClick={onGoCoach}
            style={{
              flex: '1 1 220px', padding: '13px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: premium.navy, color: premium.ivory, fontFamily: 'inherit',
              fontSize: 13.5, fontWeight: 800, letterSpacing: '0.01em'
            }}
          >
            {t('rv_hero_fix_cta', 'Fix these with CV Coach →')}
          </button>
        )}
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <SmartApplyBtn context={context} jobUrl={data.job_url || null} verdict={data.overall_verdict} />
        </div>
      </div>
    </section>
  )
}

export default function ResultsView({ data, savedRow: serverSavedRow, rateLimit, onReset, onGoCoach }) {
  const { t } = useLang()
  const score = data.display_score ?? 0
  const jobUrl = data.job_url || null
  const [analysisRow, setAnalysisRow] = useState(() => {
    if (serverSavedRow) return serverSavedRow
    if (data.id) return data
    return null
  })
  const autoSaveStatus = analysisRow ? 'saved' : 'idle'

  useEffect(() => {
    if (serverSavedRow && (!analysisRow || analysisRow.id !== serverSavedRow.id)) setAnalysisRow(serverSavedRow)
  }, [serverSavedRow, analysisRow])

  const handleStatusUpdate = updated => setAnalysisRow(updated)

  const savedRow = analysisRow || serverSavedRow
  const s = deriveSummary(data, savedRow, t)

  return (
    <div className="rvx" style={{ animation: 'fadeUp 0.5s ease' }}>
      <style>{`
        .rvx { min-width: 0; }
        .rvx .rvx-hero-head { display: flex; gap: 20px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
        .rvx .rvx-ring { width: 108px; height: 108px; border-radius: 50%; border: 9px solid transparent; display: grid; place-items: center; flex-shrink: 0; }
        .rvx .rvx-ring-score { font-size: 31px; }
        .rvx .rvx-grid-break { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
        .rvx .rvx-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
        .rvx .rvx-grid-pills { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
        @media (max-width: 640px) {
          .rvx .rvx-grid-break, .rvx .rvx-grid-2 { grid-template-columns: 1fr; }
          .rvx .rvx-grid-pills { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .rvx .rvx-ring { width: 88px; height: 88px; border-width: 7px; }
          .rvx .rvx-ring-score { font-size: 24px; }
        }
      `}</style>

      <LimitedAnalysisBanner data={data} onReset={onReset} />
      <LanguageMismatchBanner languageCheck={data.language_check} onReset={onReset} />

      <HeroSummary data={data} summary={s} t={t} onGoCoach={onGoCoach} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '0 4px', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {autoSaveStatus === 'saved' && <span style={{ fontSize: 11, color: premium.muted, fontWeight: 800 }}>✓ {t('saved_to_history')}</span>}
          {autoSaveStatus === 'saved' && analysisRow && <StatusPill analysis={analysisRow} onUpdate={handleStatusUpdate} compact />}
        </div>
        <button onClick={onReset} style={{ background: premium.paper, border: `1px solid ${premium.line}`, borderRadius: 20, padding: '7px 15px', cursor: 'pointer', color: premium.muted, fontSize: 12, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>↻ {t('run_another')}</button>
      </div>

      <NextStepsCard score={score} onGoCoach={onGoCoach} onReset={onReset} jobUrl={jobUrl} easyApply={data.job_context?.easy_apply} />
      <WaitlistBanner rateLimit={rateLimit} />

      {/* Group 1 — Why this score (open by default) */}
      <Section title={t('rv_sec_why_score', 'Why this score')} defaultOpen>
        <div className="rvx-grid-break">
          <ScoreBreakdownCard label={t('rv_sb_keywords', 'Keywords')} score={s.keywordScore} helper={`${s.foundKeywords.length} ${t('rv_found_word', 'found')} · ${s.missingKeywords.length} ${t('rv_missing_word', 'missing')}`} color={premium.gold} />
          <ScoreBreakdownCard label={t('rv_sb_experience', 'Experience')} score={s.experienceScore} helper={t('rv_sb_experience_helper', 'Relevant experience evidence')} color={premium.green} />
          <ScoreBreakdownCard label={t('rv_sb_semantic', 'Semantic fit')} score={s.semanticScore} helper={t('rv_sb_semantic_helper', 'Role/responsibility alignment')} color={premium.blue} />
          <ScoreBreakdownCard label={t('rv_sb_seniority', 'Seniority')} score={s.seniorityScore} helper={t('rv_sb_seniority_helper', 'Level and scope alignment')} color={premium.purple} />
          <ScoreBreakdownCard label={t('rv_sb_recruiter', 'Recruiter')} score={s.recruiterScore} helper={t('rv_sb_recruiter_helper', 'Shortlist probability signal')} color={s.tone} />
        </div>
        <div style={{ border: `1px solid ${premium.line}`, borderRadius: 20, padding: 16, background: 'rgba(255,255,255,0.50)', marginTop: 14 }}>
          <h3 style={{ margin: '0 0 14px', color: premium.navy, fontSize: 14, fontWeight: 950 }}>{t('missing_keywords', 'Missing keywords')}</h3>
          <div style={{ minHeight: 42 }}>{s.missingKeywords.length ? s.missingKeywords.map(k => <Tag key={`missing-${k}`} label={k} type="missing" />) : <p style={{ margin: 0, color: premium.green, fontSize: 12 }}>{t('rv_no_missing_keywords', 'No critical missing keywords detected.')}</p>}</div>
          <h3 style={{ margin: '18px 0 10px', color: premium.navy, fontSize: 14, fontWeight: 950 }}>{t('rv_found_in_cv', 'Found in CV')}</h3>
          <div>{s.foundKeywords.length ? s.foundKeywords.map(k => <Tag key={`found-${k}`} label={k} type="found" />) : <p style={{ margin: 0, color: premium.muted, fontSize: 12 }}>{t('rv_no_keyword_evidence', 'No strong keyword evidence returned.')}</p>}</div>
        </div>
        <ScoreMathCard breakdown={data.score_breakdown} penalty={data.score_penalty} explanation={data.score_explanation} total={data.display_score} />
      </Section>

      {/* Group 2 — Requirements & evidence */}
      <Section title={t('rv_sec_requirements', 'Requirements & evidence')} count={s.gaps.length + s.unmet.length}>
        <div style={{ border: `1px solid ${premium.line}`, borderRadius: 20, padding: 16, background: 'rgba(255,255,255,0.50)' }}>
          <p style={{ margin: 0, color: premium.muted, fontSize: 12, lineHeight: 1.7 }}>{s.summary}</p>
          <div style={{ marginTop: 12, padding: '13px 14px', borderRadius: 14, border: '1px solid rgba(181,102,60,0.20)', background: premium.copperSoft }}>
            <strong style={{ display: 'block', color: premium.navy, fontSize: 12, marginBottom: 5 }}>{t('rv_recruiter_screening_summary', 'Recruiter screening summary')}</strong>
            <p style={{ margin: 0, color: premium.muted, fontSize: 12, lineHeight: 1.5 }}>{s.recruiterSummary}</p>
          </div>
        </div>
        <div className="rvx-grid-break" style={{ marginTop: 14 }}>
          <SummaryCard title={t('rv_quick_wins', 'Quick wins')}><BulletList items={s.quickWins} tone="good" empty={t('rv_no_quick_wins', 'No quick wins returned.')} max={4} /></SummaryCard>
          <SummaryCard title={t('rv_gaps_to_address', 'Gaps to address')}><BulletList items={s.gaps} tone="bad" empty={t('rv_no_gaps', 'No priority gaps detected.')} max={4} /></SummaryCard>
          <SummaryCard title={t('rv_requirements_met', 'Requirements met')}><BulletList items={s.met} tone="good" empty={t('rv_no_met', 'No met requirements returned.')} max={5} /></SummaryCard>
          <SummaryCard title={t('rv_requirements_missing', 'Requirements missing')}><BulletList items={s.unmet} tone="bad" empty={t('rv_no_unmet', 'No missing requirements detected.')} max={5} /></SummaryCard>
        </div>
        <RequirementsCoverageCard items={data.requirements_coverage} proofGaps={data.proof_gaps} />
        <ImprovementPlanCard plan={data.improvement_plan} />
      </Section>

      {/* Group 3 — The job */}
      <Section title={t('rv_sec_job', 'The job')}>
        <div className="rvx-grid-pills" style={{ marginBottom: 14 }}>
          <InfoPill label={t('work_mode', 'Work mode')} value={s.context.work_mode || t('rv_not_stated', 'Not stated')} />
          <InfoPill label={t('contract', 'Contract')} value={s.context.contract_type || t('rv_not_stated', 'Not stated')} />
          <InfoPill label={t('salary', 'Salary')} value={s.salaryText} />
          <InfoPill label={t('rv_status', 'Status')} value={s.statusText} />
        </div>
        <JobDetailsCard data={data} />
        <SalaryInsightCard data={data} />
        <SeniorityCard seniority={data.seniority} />
      </Section>

      {/* Group 4 — Interview prep */}
      <Section title={t('rv_sec_interview', 'Interview prep')}>
        <InterviewPrepCard prep={data.interview_prep} score={score} />
        {onGoCoach && <CvCoachPreview data={data} onGoCoach={onGoCoach} />}
      </Section>

      {data.format_warnings?.filter(w => w?.length > 5).length > 0 && (
        <div style={{ background: 'rgba(185,134,59,0.08)', border: '1px solid rgba(185,134,59,0.22)', borderRadius: 18, padding: '14px 16px', marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 900, color: premium.gold, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>{t('format_warnings')}</p>
          {data.format_warnings.filter(w => w?.length > 5).map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: premium.gold, flexShrink: 0 }}>⚠</span>
              <p style={{ fontSize: 12, color: premium.muted, lineHeight: 1.5, margin: 0 }}>{w}</p>
            </div>
          ))}
        </div>
      )}

      <div className="btn-row">
        <button onClick={onReset} className="btn-primary" style={{ width: '100%', background: premium.navy, color: premium.ivory }}>↻ {t('run_another')}</button>
        {onGoCoach && (
          <button onClick={onGoCoach} style={{ padding: 14, borderRadius: 14, background: premium.paper, color: premium.muted, border: `1px solid ${premium.line}`, fontFamily: 'Georgia, Newsreader, serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            🎤 {t('nav_coach')}
          </button>
        )}
      </div>
    </div>
  )
}

function LimitedAnalysisBanner({ data, onReset }) {
  const { t } = useLang()
  const { degraded, reasons } = isDegradedAnalysis(data)
  if (!degraded) return null
  return (
    <div style={{
      marginBottom: 16, padding: '14px 18px', borderRadius: 16,
      border: '1.5px solid rgba(184,92,85,0.35)', background: 'rgba(184,92,85,0.07)'
    }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B85C55' }}>
        {t('limited_analysis_title', 'Limited analysis — treat this score with caution')}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6, color: premium.muted }}>
        {t('limited_analysis_desc', 'We could not fully read this job posting, so the score below is a rough keyword estimate rather than a reliable ATS verdict.')}
      </p>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: premium.muted, fontSize: 12, lineHeight: 1.6 }}>
        {reasons.map(reason => <li key={reason}>{reason}</li>)}
      </ul>
      <button type="button" onClick={onReset} style={{
        marginTop: 10, fontSize: 12, fontWeight: 800, color: '#B5663C',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline'
      }}>
        {t('limited_analysis_cta', 'Re-run in Accurate paste mode for a trustworthy score →')}
      </button>
    </div>
  )
}
