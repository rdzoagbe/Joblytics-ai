import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectTextLanguage,
  extractSkillTerms,
  estimateYears,
  buildDeterministicAts,
  applyDeterministicAts,
  simulateImprovements,
  normalizeAnalysisShape,
  validateJobTextQuality
} from './ats-deterministic.js'

const EN_DEVOPS_JOB = `We are looking for a Senior DevOps engineer with strong experience in AWS,
Kubernetes, Docker, Terraform, CI/CD pipelines, Python and monitoring. You will manage cloud
infrastructure, ensure security and compliance, and lead incident management. The role requires
strong collaboration with the team. 5 years of experience required.`

const EN_DEVOPS_CV = `Senior DevOps engineer with 7 years of experience. Built CI/CD pipelines,
managed AWS and Kubernetes clusters, Docker containers, Terraform infrastructure as code, Python
automation and monitoring with Prometheus. Led incident management and security compliance reviews.`

const FR_CONSULTING_JOB = `Nous recherchons un Directeur Technology & Strategy pour piloter nos
activites de conseil et de transformation digitale. Vous serez en charge du developpement
commercial, de l avant-vente, du recrutement et de l encadrement des equipes. Une solide
experience en strategie et en gestion de projet est requise. Poste base a Paris.`

test('detectTextLanguage identifies English and French', () => {
  assert.equal(detectTextLanguage(EN_DEVOPS_JOB).code, 'en')
  assert.equal(detectTextLanguage(FR_CONSULTING_JOB).code, 'fr')
})

test('detectTextLanguage returns unknown for too-short text', () => {
  assert.equal(detectTextLanguage('hello world').code, 'unknown')
})

test('extractSkillTerms pulls known tech skills', () => {
  const skills = extractSkillTerms(EN_DEVOPS_JOB)
  for (const expected of ['aws', 'kubernetes', 'docker', 'terraform', 'ci/cd', 'python']) {
    assert.ok(skills.includes(expected), `expected "${expected}" in ${JSON.stringify(skills)}`)
  }
})

test('extractSkillTerms resolves multilingual skills to canonical English labels', () => {
  const skills = extractSkillTerms(FR_CONSULTING_JOB)
  for (const expected of ['digital transformation', 'consulting', 'business development', 'strategy', 'pre-sales']) {
    assert.ok(skills.includes(expected), `expected "${expected}" in ${JSON.stringify(skills)}`)
  }
})

test('extractSkillTerms never emits raw prose fragments as skills', () => {
  const noisy = 'Technology & Strategy — t&s. Beta v. Apply now. Sign in to continue. SSO and API access.'
  const skills = extractSkillTerms(noisy.repeat(3))
  assert.deepEqual(skills.sort(), ['api', 'sso', 'strategy'])
  for (const skill of skills) {
    // every returned skill is a single clean token or a recognized multi-word canonical
    assert.ok(!/\bbeta\b|technology -|-t s/.test(skill), `junk leaked: "${skill}"`)
  }
})

test('estimateYears reads explicit year units across languages', () => {
  assert.equal(estimateYears('we require 5 years of experience'), 5)
  assert.equal(estimateYears('experience de 8 ans minimum'), 8)
  assert.equal(estimateYears('mindestens 6 jahre erfahrung'), 6)
  assert.equal(estimateYears('no numbers here at all'), 0)
})

test('buildDeterministicAts scores a strong same-language match highly', () => {
  const ats = buildDeterministicAts(EN_DEVOPS_JOB, EN_DEVOPS_CV)
  assert.equal(ats.keywordSignalReliable, true)
  assert.ok(ats.displayScore >= 75, `expected >=75, got ${ats.displayScore}`)
  assert.equal(ats.verdict, 'likely_passed')
})

test('buildDeterministicAts matches skills across languages via the lexicon', () => {
  const enCv = `Experienced consultant with a strong track record. You will see that I have led digital
  transformation programs for our clients, driven business development and owned strategy engagements
  with the team. I have strong leadership skills and stakeholder management experience from this role
  and the work that I have done. About 10 years of experience in this field.`
  const ats = buildDeterministicAts(FR_CONSULTING_JOB, enCv)
  assert.equal(ats.languageMismatch, true)
  // cross-language match: French "transformation digitale" <-> English "digital transformation"
  const matched = ats.matchedSkills.map(m => m.required_skill)
  assert.ok(matched.includes('digital transformation'), JSON.stringify(matched))
  assert.ok(matched.includes('strategy'), JSON.stringify(matched))
  // because the lexicon covers the skills, the signal is reliable despite the language gap
  assert.equal(ats.keywordSignalReliable, true)
})

test('buildDeterministicAts flags an unreliable signal when no known skills are found', () => {
  const job = 'We want a passionate person who loves coffee and good vibes and enjoys nice walks outdoors every single day.'
  const cv = 'I enjoy coffee and walking and good vibes and being passionate about life every day.'
  const ats = buildDeterministicAts(job, cv)
  assert.equal(ats.keywordSignalReliable, false)
})

test('applyDeterministicAts defers to AI semantic read when the signal is unreliable', () => {
  const job = 'A role about coffee culture and friendly vibes and pleasant outdoor walks for everyone.'
  const cv = 'I love coffee and walking outdoors and friendly vibes with everyone around me.'
  const ai = { semantic_fit: { score: 70 }, recruiter_shortlist: { probability: 60 } }
  const merged = applyDeterministicAts(ai, job, cv)
  assert.equal(merged.keyword_signal_reliable, false)
  // headline should reflect the AI's read, not a keyword-tanked 0-ish score
  assert.ok(merged.display_score >= 45, `expected deferred score, got ${merged.display_score}`)
})

test('applyDeterministicAts gives clean, helpful gaps and quick wins', () => {
  const enCv = `IT infrastructure manager. Microsoft 365, Active Directory, Intune, ITIL, service desk.
  10 years of experience.`
  const merged = applyDeterministicAts({}, FR_CONSULTING_JOB, enCv)
  // gaps are real canonical skills, never prose fragments
  assert.ok(merged.gaps_to_address.length > 0)
  for (const gap of merged.gaps_to_address) {
    assert.ok(!/ t s|beta| -|technologie/.test(gap), `junk gap: "${gap}"`)
  }
  // quick wins are populated rather than empty
  assert.ok(merged.quick_wins.length > 0)
})

test('extractSkillTerms covers additional industries and languages', () => {
  const dataEn = 'We need machine learning, data science, statistics, SQL and data visualization skills.'
  for (const expected of ['machine learning', 'data science', 'statistics', 'sql', 'data visualization']) {
    assert.ok(extractSkillTerms(dataEn).includes(expected), expected)
  }
  // Spanish marketing role resolves to canonical English skills
  const mktEs = 'Buscamos experiencia en marketing de contenidos, redes sociales, investigacion de mercado y optimizacion de motores de busqueda.'
  for (const expected of ['content marketing', 'social media', 'market research', 'seo']) {
    assert.ok(extractSkillTerms(mktEs).includes(expected), `${expected} in ${JSON.stringify(extractSkillTerms(mktEs))}`)
  }
})

test('simulateImprovements projects a higher score as missing skills are addressed', () => {
  const job = EN_DEVOPS_JOB
  // A partial CV missing several of the job's skills, leaving headroom to improve.
  const cv = 'Junior engineer with 5 years experience. I have used AWS and Python and some Docker.'
  const ats = buildDeterministicAts(job, cv)
  assert.ok(ats.missingSkills.length > 0)
  const plan = simulateImprovements(ats)
  assert.equal(plan.current_score, ats.displayScore)
  // Evidencing every missing skill should not lower the score, and should raise it.
  assert.ok(plan.max_projected_score >= plan.current_score)
  assert.ok(plan.max_projected_score > plan.current_score, 'addressing skills should raise the score')
  assert.deepEqual(plan.addressable_skills.sort(), [...ats.missingSkills].sort())
})

test('applyDeterministicAts attaches an improvement plan with a path to interview', () => {
  const cv = 'Mid-level engineer, 5 years. Worked with AWS, Python, Docker.'
  const merged = applyDeterministicAts({}, EN_DEVOPS_JOB, cv)
  assert.ok(merged.improvement_plan, 'improvement_plan should be present when signal is reliable')
  assert.ok(Array.isArray(merged.improvement_plan.addressable_skills))
  // to_interview is either a reachable plan or an honest "skills alone are not enough"
  if (merged.improvement_plan.to_interview) {
    assert.ok('reachable' in merged.improvement_plan.to_interview)
  }
})

test('normalizeAnalysisShape fills a complete shape from empty/partial/garbage input', () => {
  for (const input of [null, undefined, {}, { job_summary: 123, quick_wins: 'nope' }, 'string']) {
    const a = normalizeAnalysisShape(input)
    assert.equal(typeof a.job_context, 'object')
    assert.equal(typeof a.job_context.title, 'string')
    assert.ok(Array.isArray(a.quick_wins))
    assert.ok(Array.isArray(a.red_flags))
    assert.equal(typeof a.recruiter_shortlist, 'object')
    assert.equal(typeof a.interview_prep, 'object')
    assert.ok(Array.isArray(a.interview_prep.likely_questions))
    assert.equal(typeof a.job_summary, 'string')
  }
})

test('normalizeAnalysisShape preserves valid AI values', () => {
  const a = normalizeAnalysisShape({ job_summary: 'Great role', quick_wins: ['x'], job_context: { title: 'Engineer' } })
  assert.equal(a.job_summary, 'Great role')
  assert.deepEqual(a.quick_wins, ['x'])
  assert.equal(a.job_context.title, 'Engineer')
  assert.equal(a.job_context.company, 'Not specified') // default filled
})

test('applyDeterministicAts back-fills requirements_coverage from the skill match when AI gives none', () => {
  const cv = 'Mid-level engineer, 5 years. Worked with AWS, Python, Docker.'
  const merged = applyDeterministicAts({}, EN_DEVOPS_JOB, cv)
  assert.ok(Array.isArray(merged.requirements_coverage) && merged.requirements_coverage.length > 0)
  const statuses = new Set(merged.requirements_coverage.map(r => r.status))
  assert.ok(statuses.has('met') || statuses.has('missing'))
  for (const row of merged.requirements_coverage) {
    assert.equal(typeof row.requirement, 'string')
    assert.ok(['met', 'partial', 'missing'].includes(row.status))
    assert.equal(typeof row.suggestion, 'string')
  }
  // missing requirements must carry a truthful, non-fabricating suggestion
  const missing = merged.requirements_coverage.find(r => r.status === 'missing')
  if (missing) assert.match(missing.suggestion, /if you have it/i)
})

test('applyDeterministicAts preserves the AI requirements_coverage when present', () => {
  const ai = { requirements_coverage: [
    { requirement: 'Lead incident management', status: 'met', evidence: 'Led on-call rotation', suggestion: 'Add MTTR numbers.' },
    { requirement: 'Kubernetes at scale', status: 'partial', evidence: 'Used k8s', suggestion: 'Quantify cluster size.' }
  ] }
  const merged = applyDeterministicAts(ai, EN_DEVOPS_JOB, 'Engineer, AWS, Python, Docker, 5 years.')
  assert.equal(merged.requirements_coverage.length, 2)
  assert.equal(merged.requirements_coverage[0].requirement, 'Lead incident management')
  assert.equal(merged.requirements_coverage[0].status, 'met')
})

test('applyDeterministicAts exposes a score breakdown that explains the number', () => {
  const cv = 'Senior DevOps engineer, 7 years. AWS, Kubernetes, Docker, Terraform, Python, CI/CD, monitoring, security.'
  const merged = applyDeterministicAts({}, EN_DEVOPS_JOB, cv)
  assert.ok(Array.isArray(merged.score_breakdown))
  const totalPoints = merged.score_breakdown.reduce((sum, f) => sum + f.points, 0) - (merged.score_penalty || 0)
  // breakdown points (minus penalty) should land within rounding of the display score
  assert.ok(Math.abs(totalPoints - merged.display_score) <= 2, `breakdown ${totalPoints} vs score ${merged.display_score}`)
  assert.equal(typeof merged.score_explanation, 'string')
  assert.ok(merged.score_explanation.length > 0)
})

test('validateJobTextQuality blocks an anti-bot / login wall page', () => {
  const result = validateJobTextQuality('Please enable JavaScript and cookies to continue. Sign in to continue.', { source: 'url', url: 'https://www.linkedin.com/jobs/view/123' })
  assert.equal(result.blocked, true)
  assert.equal(result.ok, false)
})

test('validateJobTextQuality accepts a full, real job description', () => {
  const result = validateJobTextQuality(EN_DEVOPS_JOB + ' '.repeat(0) + EN_DEVOPS_JOB, { source: 'paste' })
  assert.equal(result.blocked, false)
})
