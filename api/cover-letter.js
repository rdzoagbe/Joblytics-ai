import Anthropic from '@anthropic-ai/sdk'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function requireUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  const token = typeof header === 'string' ? (header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null) : null
  if (!token) {
    const err = new Error('Authentication required. Please sign in and try again.')
    err.statusCode = 401
    throw err
  }
  const supabase = getSupabaseClient()
  if (!supabase) {
    const err = new Error('Server authentication is not configured.')
    err.statusCode = 500
    throw err
  }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    const err = new Error('Your session could not be verified. Please refresh the page or sign in again.')
    err.statusCode = 401
    throw err
  }
  return data.user
}

async function extractCvText(base64Data, mimeType) {
  const buffer = Buffer.from(base64Data, 'base64')
  if (mimeType === 'application/pdf') return (await pdfParse(buffer)).text
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return (await mammoth.extractRawText({ buffer })).value
  throw new Error('Unsupported file type. Please upload a PDF or Word document.')
}

async function handleCvOptimize(req, res) {
  try { await requireUser(req) } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }) }
  const { cvBase64, cvMimeType, analysis, lang = 'en' } = req.body
  if (!cvBase64 || !cvMimeType) return res.status(400).json({ error: 'Missing CV file. Please upload your CV first.' })
  if (!analysis?.job_context) return res.status(400).json({ error: 'Missing analysis context. Please run an analysis first.' })
  let cvText
  try { cvText = await extractCvText(cvBase64, cvMimeType) } catch (e) { return res.status(400).json({ error: e.message || 'Could not read CV file.' }) }
  if (!cvText || cvText.trim().length < 100) return res.status(400).json({ error: 'CV text is too short or could not be extracted. Make sure your CV is not a scanned image.' })
  const r = analysis
  const langInstruction = { en: 'All output must be in English.', fr: 'Toute la sortie doit être en français.', es: 'Toda la salida debe estar en español.', de: 'Alle Ausgaben müssen auf Deutsch sein.', it: 'Tutto l\'output deve essere in italiano.', pt: 'Todo o output deve estar em português.' }[lang] || 'All output must be in English.'
  const missingKeywords = (r.keyword_match?.missing_required || r.keyword_match?.missing || []).slice(0, 12)
  const foundKeywords = (r.keyword_match?.found || r.keyword_match?.matched || []).slice(0, 12)
  const criticalGaps = (r.gaps_to_address || r.critical_gaps || []).slice(0, 5)
  const prompt = `You are a senior career coach helping a job seeker optimize their CV for a specific job. You must NOT fabricate or invent experience that isn't in the original CV. You may only: reword existing experience using more impactful language, reorganize sections to put the most job-relevant content first, emphasize keywords from the job posting that are already present, suggest where to add specific skills the user likely has but didn't mention, quantify achievements where the user implied numbers.\n\nReturn a STRUCTURED JSON object with these exact fields. ${langInstruction}\n\nJOB CONTEXT:\nTitle: ${r.job_context?.title || 'Position'}\nCompany: ${r.job_context?.company || 'Not specified'}\nRequired keywords (already in CV): ${foundKeywords.join(', ') || 'none extracted'}\nMissing keywords (try to integrate where truthful): ${missingKeywords.join(', ') || 'none'}\nCritical gaps to address: ${criticalGaps.join('; ') || 'none'}\n\nORIGINAL CV:\n${cvText.slice(0, 6000)}\n\nOUTPUT FORMAT — return ONLY this JSON, no preamble, no markdown:\n{\n  "header": { "full_name": "<name from CV>", "title": "<professional title>", "contact": { "email": "", "phone": "", "location": "", "linkedin": "" } },\n  "summary": "<3-4 sentence professional summary tailored to the target role>",\n  "experience": [{ "title": "", "company": "", "location": "", "dates": "", "bullets": ["<bullet 1>", "<bullet 2>", "<bullet 3 max>"] }],\n  "skills": { "technical": [], "soft": [], "languages": [] },\n  "education": [{ "degree": "", "institution": "", "location": "", "dates": "" }],\n  "changes_made": ["<change 1>", "<change 2>", "<change 3>"],\n  "honest_disclaimer": "<one short sentence reminding user to verify before sending>"\n}\n\nCRITICAL RULES: NEVER invent skills, jobs, or qualifications. Keep the original truth. Include ALL real roles from the CV (up to 8, most recent first) so the resume stays complete — reword and re-order bullets, never drop a genuine job. Maximum 8 technical skills, 5 soft skills.`
  let message
  try {
    message = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 3500, temperature: 0.3, messages: [{ role: 'user', content: prompt }] })
  } catch (e) {
    console.error('CV optimize AI error:', e?.message)
    return res.status(502).json({ error: 'The CV optimizer is busy right now. Please try again in a moment.' })
  }
  const raw = message.content.map(b => b.text || '').join('').trim().replace(/```json|```/g, '').trim()
  let optimized
  try { optimized = JSON.parse(raw) } catch (e) { return res.status(500).json({ error: 'Could not parse the optimized CV. Please try again.' }) }
  optimized.header = optimized.header || { full_name: '', title: '', contact: {} }
  optimized.experience = Array.isArray(optimized.experience) ? optimized.experience.slice(0, 8) : []
  optimized.skills = optimized.skills || { technical: [], soft: [], languages: [] }
  optimized.education = Array.isArray(optimized.education) ? optimized.education : []
  optimized.changes_made = Array.isArray(optimized.changes_made) ? optimized.changes_made.slice(0, 5) : []
  optimized.summary = optimized.summary || ''
  optimized.honest_disclaimer = optimized.honest_disclaimer || 'Please review and edit before sending.'
  return res.status(200).json({ success: true, optimized })
}

// Locale-aware salutations and sign-offs
const SALUTATIONS = {
  en: 'Dear Hiring Manager,',
  fr: 'Madame, Monsieur,',
  es: 'Estimado/a equipo de selección,',
  de: 'Sehr geehrte Damen und Herren,',
  it: 'Gentile Responsabile delle Risorse Umane,',
  pt: 'Prezada Equipa de Recrutamento,'
}

const SIGN_OFFS = {
  professional: { en: 'Best regards', fr: 'Cordialement', es: 'Atentamente', de: 'Mit freundlichen Grüßen', it: 'Cordiali saluti', pt: 'Com os melhores cumprimentos' },
  warm: { en: 'Looking forward to connecting', fr: 'Au plaisir de vous lire', es: 'Un cordial saludo', de: 'Herzliche Grüße', it: 'A presto', pt: 'Aguardo o vosso contacto' },
  formal: { en: 'Yours sincerely', fr: 'Veuillez agréer mes salutations distinguées', es: 'Reciba un cordial saludo', de: 'Hochachtungsvoll', it: 'Distinti saluti', pt: 'Os meus cumprimentos' },
  enthusiastic: { en: 'Looking forward to hearing from you', fr: 'Dans l\'attente de vous rencontrer', es: 'Quedo a la espera de su respuesta', de: 'Ich freue mich auf Ihre Rückmeldung', it: 'Resto in attesa di un Suo riscontro', pt: 'Fico ansioso pelo vosso contacto' }
}

function pickSalutation(recipient, lang) {
  if (recipient && recipient.trim()) {
    // Use the supplied recipient name
    const name = recipient.trim()
    if (lang === 'fr') return `Bonjour ${name},`
    if (lang === 'es') return `Estimado/a ${name},`
    if (lang === 'de') return `Sehr geehrte/r ${name},`
    if (lang === 'it') return `Gentile ${name},`
    if (lang === 'pt') return `Caro/a ${name},`
    return `Dear ${name},`
  }
  return SALUTATIONS[lang] || SALUTATIONS.en
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (req.body?.type === 'cv-optimize') return handleCvOptimize(req, res)

  try {
    await requireUser(req)
    const { analysis, lang = 'en', tone = 'professional', length = 'standard', recipient = null, fullName = null } = req.body
    if (!analysis?.job_context) return res.status(400).json({ error: 'Missing analysis context' })

    const lengthSpec = {
      short: {
        instruction: 'VERY SHORT — 1 tight paragraph, 70-90 words total. Get straight to the point: who you are + top match + interest. No fluff.',
        structure: 'exactly 1 paragraph (4-6 sentences max)',
        wordCap: 90,
        maxTokens: 400
      },
      standard: {
        instruction: 'STANDARD length — 3 short paragraphs, 180-220 words total.',
        structure: 'exactly 3 short paragraphs:\n  - Paragraph 1: express genuine interest in the role, mention your top relevant qualification\n  - Paragraph 2: 2-3 specific achievements matching the role requirements (use real numbers if your_edges has them)\n  - Paragraph 3: forward-looking close, express interest in next steps',
        wordCap: 220,
        maxTokens: 800
      },
      detailed: {
        instruction: 'DETAILED — 4 paragraphs, 280-340 words total. More depth, more specific examples, more elaboration on motivation.',
        structure: 'exactly 4 paragraphs:\n  - Paragraph 1: opening, interest in the role, why this company specifically (1-2 sentences about company values/mission if inferable)\n  - Paragraph 2: 2 strongest achievements aligned with the role with concrete details/numbers\n  - Paragraph 3: relevant skills and how you would specifically contribute to the role\n  - Paragraph 4: forward-looking close, mention availability and interest in discussing further',
        wordCap: 340,
        maxTokens: 1200
      }
    }[length] || {
      instruction: 'STANDARD length — 3 short paragraphs, 180-220 words total.',
      structure: 'exactly 3 short paragraphs',
      wordCap: 220,
      maxTokens: 800
    }

    const r = analysis
    const langInstruction = {
      en: 'Write the letter body in English.',
      fr: 'Rédige le corps de la lettre en français.',
      es: 'Escribe el cuerpo de la carta en español.',
      de: 'Schreibe den Brieftext auf Deutsch.',
      it: 'Scrivi il corpo della lettera in italiano.',
      pt: 'Escreve o corpo da carta em português.'
    }[lang] || 'Write the letter body in English.'

    const toneInstruction = {
      professional: 'Confident and professional but not stiff.',
      warm: 'Warm and personable while still professional.',
      formal: 'Highly formal and respectful (suitable for traditional industries).',
      enthusiastic: 'Enthusiastic and energetic, conveying passion for the role.'
    }[tone] || 'Confident and professional but not stiff.'

    const prompt = `Write the BODY ONLY of a cover letter for this job application. Do NOT include any salutation (no "Dear..."), date, address, or sign-off. Just the body content.

JOB: ${r.job_context?.title || 'Position'} at ${r.job_context?.company || 'the company'}
LOCATION: ${r.job_context?.location || 'Not specified'}
CONTRACT: ${r.job_context?.contract_type || 'Not specified'}

JOB SUMMARY: ${r.job_summary || ''}

CANDIDATE STRENGTHS (from CV analysis):
${(r.interview_prep?.your_edges || []).map(e => '- ' + e).join('\n') || '- Strong technical skills'}

KEYWORDS TO NATURALLY INCLUDE:
${(r.keyword_match?.found || []).slice(0, 8).join(', ') || 'relevant skills'}

CRITICAL GAPS TO ADDRESS (if any):
${(r.critical_gaps || []).map(g => '- ' + g).join('\n') || '- None'}

INSTRUCTIONS:
- ${langInstruction}
- Tone: ${toneInstruction}
- Length: ${lengthSpec.instruction}
- Structure: ${lengthSpec.structure}
- DO NOT include the salutation (no "Dear X,") or sign-off (no "Best regards" / "Sincerely") — those will be added separately
- Be specific, not generic. Reference the actual job and skills.
- Maximum ${lengthSpec.wordCap} words for the body.
- Return ONLY the paragraphs separated by blank lines. No preamble, no headers, no signature.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: lengthSpec.maxTokens,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    })

    const body = message.content.map(b => b.text || '').join('').trim()

    // Compose the full letter with salutation + body + sign-off + name
    const salutation = pickSalutation(recipient, lang)
    const signOff = (SIGN_OFFS[tone] || SIGN_OFFS.professional)[lang] || (SIGN_OFFS[tone] || SIGN_OFFS.professional).en
    const name = (fullName && fullName.trim()) ? fullName.trim() : ''

    const letter = `${salutation}\n\n${body}\n\n${signOff},\n${name}`.trim()

    return res.status(200).json({ success: true, letter, salutation, signOff, body })
  } catch (e) {
    console.error('Cover letter error:', e.message)
    return res.status(500).json({ error: e.message || 'Failed to generate cover letter' })
  }
}
