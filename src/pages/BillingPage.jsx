import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { supabase } from '../lib/supabase'
import { TERMS_VERSION, billingLegalAcceptancePayload, storePendingBillingLegalAcceptance } from '../lib/legal'
import './BillingPage.css'
import './BillingPhase8.css'

async function getFreshAccessToken(session) {
  if (session?.access_token) return session.access_token
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

function PlanCard({ planId, name, price, description, features, badge, current, t, checkoutLoading, selected, onSelectPlan, bestFor, limits }) {
  const paid = !current
  const buttonText = current ? t('billing_free_plan') : checkoutLoading === planId ? t('billing_redirecting', 'Redirecting...') : t('billing_choose_plan', { plan: name }, `Choose ${name}`)
  const bestForLabel = t('billing_best_for', 'Best for')

  return (
    <article className={`billing-card phase8-plan ${badge ? 'is-highlighted' : ''} ${selected ? 'is-selected' : ''}`}>
      <div className="billing-cardTop"><div><p className="billing-kicker">{current ? t('billing_current_plan') : name}</p><h2>{name}</h2></div>{badge && <span className="billing-badge">{badge}</span>}</div>
      <div className="billing-price"><strong>{price}</strong><span>/ {t('billing_month')}</span></div>
      <p className="billing-desc">{description}</p>
      {bestFor && <div className="phase8-bestFor"><span>{bestForLabel}</span><strong>{bestFor}</strong></div>}
      {limits?.length > 0 && <div className="phase8-limits">{limits.map(item => <span key={item}>{item}</span>)}</div>}
      <ul className="billing-features">{features.map(feature => <li key={feature}>{feature}</li>)}</ul>
      <button type="button" className="billing-button" disabled={current || checkoutLoading === planId} onClick={() => paid && onSelectPlan({ planId, name, price, description, features })}>{buttonText}</button>
    </article>
  )
}

function BillingContractModal({ plan, t, legalAccepted, withdrawalAccepted, legalError, checkoutLoading, onToggleLegal, onToggleWithdrawal, onCancel, onConfirm }) {
  if (!plan) return null
  const loading = checkoutLoading === plan.planId
  return (
    <div className="billing-contractBackdrop" role="dialog" aria-modal="true" aria-labelledby="billing-contract-title">
      <article className="billing-contract">
        <button type="button" className="billing-contractClose" onClick={onCancel} disabled={loading} aria-label={t('close', 'Close')}>×</button>
        <div className="billing-contractHead"><p className="billing-kicker">{t('billing_contract_kicker', 'Subscription contract')}</p><h2 id="billing-contract-title">{t('billing_contract_title', { plan: plan.name }, `Confirm your ${plan.name} subscription`)}</h2><span>{t('billing_contract_subtitle', 'Review the selected plan and accept the required legal terms before being redirected to Stripe Checkout.')}</span></div>
        <div className="billing-contractPlan"><div><span>{t('billing_contract_selected_plan', 'Selected plan')}</span><strong>{plan.name}</strong><p>{plan.description}</p></div><div className="billing-contractPrice"><strong>{plan.price}</strong><em>/ {t('billing_month')}</em></div></div>
        <div className="billing-contractTerms">
          <h3>{t('billing_contract_terms_title', 'Required acceptance')}</h3>
          <label className="billing-legalCheck"><input type="checkbox" checked={legalAccepted} onChange={event => onToggleLegal(event.target.checked)} /><span>{t('billing_legal_checkbox')} <a href="/terms" target="_blank" rel="noreferrer">{t('terms_of_use')}</a> · <a href="/privacy" target="_blank" rel="noreferrer">{t('privacy_policy_full')}</a> · <a href="/legal" target="_blank" rel="noreferrer">{t('legal_notice')}</a></span></label>
          <label className="billing-legalCheck"><input type="checkbox" checked={withdrawalAccepted} onChange={event => onToggleWithdrawal(event.target.checked)} /><span>{t('billing_withdrawal_checkbox')}</span></label>
          <p className="billing-contractVersion">{t('billing_contract_version', 'Legal version')}: {TERMS_VERSION}</p>
        </div>
        {legalError && <p className="billing-error">⚠ {legalError}</p>}
        <div className="billing-contractActions"><button type="button" className="billing-secondaryButton" onClick={onCancel} disabled={loading}>{t('cancel', 'Cancel')}</button><button type="button" className="billing-button" onClick={onConfirm} disabled={loading}>{loading ? t('billing_redirecting', 'Redirecting...') : t('billing_accept_contract_checkout', 'Accept and continue to checkout')}</button></div>
      </article>
    </div>
  )
}

function ValueMoment({ icon, title, body }) {
  return <article className="phase8-valueMoment"><span>{icon}</span><strong>{title}</strong><p>{body}</p></article>
}

function ComparisonTable({ t }) {
  const rows = [
    [t('billing_cmp_r1_0', 'ATS/job analyses'), t('billing_cmp_r1_1', 'Starter quota'), t('billing_cmp_r1_2', 'Higher monthly quota'), t('billing_cmp_r1_3', 'Heavy search quota')],
    [t('billing_cmp_r2_0', 'CV Builder'), t('billing_cmp_r2_1', 'Preview only'), t('billing_cmp_r2_2', 'Tailored CV drafts'), t('billing_cmp_r2_3', 'Tailored CV drafts + versioning')],
    [t('billing_cmp_r3_0', 'Communication assets'), t('billing_cmp_r3_1', 'Basic examples'), t('billing_cmp_r3_2', 'Recruiter outreach + follow-up drafts'), t('billing_cmp_r3_3', 'Full message workflow')],
    [t('billing_cmp_r4_0', 'Job tracker'), t('billing_cmp_r4_1', 'Local history'), t('billing_cmp_r4_2', 'Application CRM board'), t('billing_cmp_r4_3', 'Application CRM board')],
    [t('billing_cmp_r5_0', 'Smart Sync'), t('billing_cmp_r5_1', 'Preview / manual sync'), t('billing_cmp_r5_2', 'Standard sync'), t('billing_cmp_r5_3', 'Priority sync roadmap')],
    [t('billing_cmp_r6_0', 'Best use case'), t('billing_cmp_r6_1', 'Testing the product'), t('billing_cmp_r6_2', 'Active job search'), t('billing_cmp_r6_3', 'High-volume search / career pivot')]
  ]

  return (
    <section className="phase8-comparison">
      <div className="phase8-sectionHead"><p>{t('billing_cmp_heading_kicker', 'Plan comparison')}</p><h2>{t('billing_cmp_heading_title', 'Choose based on job-search intensity')}</h2><span>{t('billing_cmp_heading_desc', 'The paid plan should be easy to understand: more analyses, more tailored assets, and less manual work.')}</span></div>
      <div className="phase8-tableWrap">
        <table>
          <thead><tr><th>{t('billing_cmp_th_capability', 'Capability')}</th><th>{t('billing_cmp_th_free', 'Free')}</th><th>{t('billing_cmp_th_starter', 'Starter')}</th><th>{t('billing_cmp_th_pro', 'Pro')}</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row[0]}>{row.map(cell => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  )
}

export default function BillingPage() {
  const { session } = useAuth()
  const { t } = useLang()
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [withdrawalAccepted, setWithdrawalAccepted] = useState(false)
  const [legalError, setLegalError] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState('')

  const plans = [
    { planId: 'free', name: t('billing_free_plan'), price: t('billing_free_price'), description: t('billing_free_desc'), current: true, bestFor: t('billing_bestfor_free', 'Trying Joblytics'), limits: [t('billing_limit_free_1', 'Starter quota'), t('billing_limit_free_2', 'Manual workflow'), t('billing_limit_free_3', 'Basic history')], features: [t('billing_feature_ats_3'), t('billing_feature_profile_1'), t('billing_feature_history'), t('billing_feature_cv_builder_locked')] },
    { planId: 'starter', name: t('billing_starter_name'), price: t('billing_starter_price'), description: t('billing_starter_desc'), badge: t('billing_popular'), bestFor: t('billing_bestfor_starter', 'Active job seekers'), limits: [t('billing_limit_starter_1', '40 ATS checks'), t('billing_limit_starter_2', '10 profile optimizations'), t('billing_limit_starter_3', 'CV + messages')], features: [t('billing_feature_ats_40'), t('billing_feature_profile_10'), t('billing_feature_cv_builder'), t('billing_feature_priority')] },
    { planId: 'pro', name: t('billing_pro_name'), price: t('billing_pro_price'), description: t('billing_pro_desc'), bestFor: t('billing_bestfor_pro', 'High-volume search'), limits: [t('billing_limit_pro_1', '200 ATS checks'), t('billing_limit_pro_2', '60 profile optimizations'), t('billing_limit_pro_3', 'Future automation')], features: [t('billing_feature_ats_200'), t('billing_feature_profile_60'), t('billing_feature_cv_builder'), t('billing_feature_future')] }
  ]

  const onSelectPlan = plan => { setSelectedPlan(plan); setLegalAccepted(false); setWithdrawalAccepted(false); setLegalError('') }
  const onToggleLegal = value => { setLegalAccepted(value); if (value && withdrawalAccepted) setLegalError('') }
  const onToggleWithdrawal = value => { setWithdrawalAccepted(value); if (value && legalAccepted) setLegalError('') }
  const onCancelContract = () => { if (checkoutLoading) return; setSelectedPlan(null); setLegalAccepted(false); setWithdrawalAccepted(false); setLegalError('') }

  const onConfirmContract = async () => {
    if (!selectedPlan) return
        if (!legalAccepted) { setLegalError(t('billing_legal_required')); return }
    if (!withdrawalAccepted) { setLegalError(t('billing_withdrawal_required')); return }
    setLegalError('')
    setCheckoutLoading(selectedPlan.planId)
    try {
      const legalAcceptance = billingLegalAcceptancePayload({ planId: selectedPlan.planId, planName: selectedPlan.name, source: 'billing_contract_modal_stripe_checkout' })
      storePendingBillingLegalAcceptance(legalAcceptance)
      const token = await getFreshAccessToken(session)
      if (!token) throw new Error(t('billing_signin_required', 'Please sign in before subscribing.'))
      const res = await fetch('/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ planId: selectedPlan.planId, legalAcceptance }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Could not start checkout (${res.status})`)
      if (!data?.url) throw new Error(t('billing_stripe_no_url', 'Stripe did not return a checkout URL.'))
      window.location.href = data.url
    } catch (e) {
      setLegalError(e.message || t('billing_checkout_failed', 'Could not start checkout. Please try again.'))
      setCheckoutLoading('')
    }
  }

  return (
    <div className="billing-page phase8-page">
      <main className="billing-shell phase8-shell">
        <section className="billing-hero phase8-hero">
          <div><p className="billing-kicker">{t('billing_kicker')}</p><h1>{t('billing_title')}</h1><p>{t('billing_subtitle')}</p></div>
          <div className="billing-status phase8-status"><strong>{t('billing_status_ready')}</strong><span>{t('billing_status_body')}</span></div>
        </section>

        <section className="phase8-valueGrid">
          <ValueMoment icon="🎯" title={t('billing_value_analyze_title', 'Analyze before applying')} body={t('billing_value_analyze_body', 'Use ATS score, recruiter risk and missing proof to avoid wasting applications.')} />
          <ValueMoment icon="📝" title={t('billing_value_tailor_title', 'Tailor faster')} body={t('billing_value_tailor_body', 'Turn one analysis into a CV draft, recruiter message and follow-up assets.')} />
          <ValueMoment icon="📌" title={t('billing_value_track_title', 'Track every role')} body={t('billing_value_track_body', 'Keep application status, next actions and reminders in one career CRM.')} />
          <ValueMoment icon="🔗" title={t('billing_value_clip_title', 'Clip from job boards')} body={t('billing_value_clip_body', 'Use the extension foundation to move job text into Joblytics with less copy-paste.')} />
        </section>

        <section className="billing-legalPanel phase8-legalPanel"><div><p className="billing-kicker">{t('billing_legal_title')}</p><h2>{t('billing_checkout_ready')}</h2><p>{t('billing_legal_body')}</p></div><strong>{TERMS_VERSION}</strong></section>
        <section className="billing-grid phase8-grid">{plans.map(plan => <PlanCard key={plan.planId} {...plan} t={t} selected={selectedPlan?.planId === plan.planId} checkoutLoading={checkoutLoading} onSelectPlan={onSelectPlan} />)}</section>

        <ComparisonTable t={t} />

        <section className="phase8-upgradeMoments">
          <div className="phase8-sectionHead"><p>{t('billing_unlock_kicker', 'What you unlock')}</p><h2>{t('billing_unlock_title', 'Get more out of every job search')}</h2><span>{t('billing_unlock_desc', 'Paid plans give you higher analysis quotas and access to the full asset generation suite.')}</span></div>
          <div className="phase8-momentList">
            <article><strong>{t('billing_unlock_1_title', 'More ATS checks')}</strong><p>{t('billing_unlock_1_body', 'Run up to 40 or 200 analyses per month — enough for an active job search across multiple roles.')}</p></article>
            <article><strong>{t('billing_unlock_2_title', 'CV rewrites & cover letters')}</strong><p>{t('billing_unlock_2_body', 'Generate a fully tailored CV and cover letter for each application, not just a score.')}</p></article>
            <article><strong>{t('billing_unlock_3_title', 'Recruiter outreach')}</strong><p>{t('billing_unlock_3_body', 'Create cold outreach messages and follow-ups grounded in the job analysis data.')}</p></article>
            <article><strong>{t('billing_unlock_4_title', 'Smart Sync tracking')}</strong><p>{t('billing_unlock_4_body', 'Detect replies, interviews, rejections and needed follow-ups from your inbox automatically.')}</p></article>
          </div>
        </section>

        <section className="billing-infoGrid phase8-infoGrid"><article className="billing-info"><p className="billing-kicker">{t('billing_note_title')}</p><p>{t('billing_note_body')}</p></article><article className="billing-info"><p className="billing-kicker">{t('billing_free_limit_title')}</p><p>{t('billing_free_limit_body')}</p></article></section>
      </main>
      <BillingContractModal plan={selectedPlan} t={t} legalAccepted={legalAccepted} withdrawalAccepted={withdrawalAccepted} legalError={legalError} checkoutLoading={checkoutLoading} onToggleLegal={onToggleLegal} onToggleWithdrawal={onToggleWithdrawal} onCancel={onCancelContract} onConfirm={onConfirmContract} />
    </div>
  )
}
