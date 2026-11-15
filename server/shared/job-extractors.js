// Extra job-posting extraction strategies so URL analysis works on far more sites than a
// raw HTML scrape (which most job boards wall off). Two high-coverage approaches:
//   1. JSON-LD JobPosting — the schema.org data Google for Jobs requires, embedded in the
//      page HTML by Indeed, Greenhouse, Lever, Workday and most company career pages, and
//      usually present even when the visible page is a login/anti-bot wall.
//   2. Public ATS JSON APIs — Greenhouse, Lever, SmartRecruiters and Ashby expose the job
//      as clean JSON at a predictable endpoint derived from the posting URL.
// The parsing here is pure/synchronous and unit-tested; the network calls live in the caller.

const htmlEntities = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&#039;': "'", '&#x27;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–'
}

// Decode HTML entities to their characters. Some ATS APIs (Greenhouse) return the job body
// as entity-encoded HTML (e.g. "&lt;p&gt;"), which must be decoded before tags can be stripped.
export function htmlUnescape(value = '') {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z0-9]+;/gi, m => htmlEntities[m.toLowerCase()] ?? m)
}

export function stripHtmlToText(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|section|br)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z0-9#]+;/gi, m => htmlEntities[m.toLowerCase()] ?? ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// --- JSON-LD JobPosting -------------------------------------------------------------------

function collectJobPostings(node, out) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(n => collectJobPostings(n, out)); return }
  const type = node['@type']
  const isJob = Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting'
  if (isJob) out.push(node)
  if (Array.isArray(node['@graph'])) node['@graph'].forEach(n => collectJobPostings(n, out))
}

function jobPostingToText(job) {
  if (!job || typeof job !== 'object') return ''
  const parts = []
  if (job.title) parts.push(String(job.title))
  const org = job.hiringOrganization
  const orgName = typeof org === 'string' ? org : org?.name
  if (orgName) parts.push(`Company: ${orgName}`)
  const loc = job.jobLocation
  const locName = Array.isArray(loc)
    ? loc.map(l => l?.address?.addressLocality || l?.address?.addressRegion).filter(Boolean).join(', ')
    : (loc?.address?.addressLocality || loc?.address?.addressRegion)
  if (locName) parts.push(`Location: ${locName}`)
  if (job.employmentType) parts.push(`Type: ${[].concat(job.employmentType).join(', ')}`)
  if (job.description) parts.push(stripHtmlToText(job.description))
  return parts.filter(Boolean).join('\n').trim()
}

// Returns the best JobPosting text found in the HTML's JSON-LD blocks, or '' if none.
export function extractJobPostingJsonLd(html = '') {
  const blocks = String(html || '').match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  if (!blocks) return ''
  const jobs = []
  for (const block of blocks) {
    const raw = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim()
    let parsed
    try { parsed = JSON.parse(raw) } catch { continue }
    collectJobPostings(parsed, jobs)
  }
  let best = ''
  for (const job of jobs) {
    const text = jobPostingToText(job)
    if (text.length > best.length) best = text
  }
  return best
}

// --- Public ATS APIs ----------------------------------------------------------------------

// Map a known ATS posting URL to its public JSON API. Returns { platform, apiUrl, matchId }
// or null when the URL isn't a recognized ATS. matchId is set when the API returns a list
// that must be filtered (Ashby).
export function parseAtsTarget(rawUrl) {
  let u
  try { u = new URL(String(rawUrl)) } catch { return null }
  const host = u.hostname.toLowerCase()
  const seg = u.pathname.split('/').filter(Boolean)

  // Greenhouse: boards.greenhouse.io/{board}/jobs/{id}  |  job-boards.greenhouse.io/{board}/jobs/{id}
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const jobsIdx = seg.indexOf('jobs')
    if (seg[0] && jobsIdx > 0 && seg[jobsIdx + 1]) {
      const id = seg[jobsIdx + 1].replace(/[^0-9].*$/, '')
      if (id) return { platform: 'greenhouse', apiUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(seg[0])}/jobs/${encodeURIComponent(id)}` }
    }
  }
  // Greenhouse embedded on a company page: ?gh_jid=123 (board token in ?for= or subdomain unknown) — skip, unreliable.

  // Lever: jobs.lever.co/{company}/{id}
  if (host === 'jobs.lever.co' && seg[0] && seg[1]) {
    return { platform: 'lever', apiUrl: `https://api.lever.co/v0/postings/${encodeURIComponent(seg[0])}/${encodeURIComponent(seg[1])}` }
  }

  // SmartRecruiters: jobs.smartrecruiters.com/{company}/{id}-{slug}
  if (host === 'jobs.smartrecruiters.com' && seg[0] && seg[1]) {
    const id = seg[1].split('-')[0].replace(/[^0-9]/g, '')
    if (id) return { platform: 'smartrecruiters', apiUrl: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(seg[0])}/postings/${encodeURIComponent(id)}` }
  }

  // Ashby: jobs.ashbyhq.com/{company}/{uuid}
  if (host === 'jobs.ashbyhq.com' && seg[0] && seg[1]) {
    return { platform: 'ashby', apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(seg[0])}?includeCompensation=false`, matchId: seg[1] }
  }

  // APEC (France): www.apec.fr/.../detail-offre/{numeroOffre}. The SPA loads each job from
  // an internal detail webservice; we target it directly. The parser deep-harvests text so
  // it tolerates the exact JSON field names differing.
  if (host === 'www.apec.fr' || host === 'apec.fr') {
    const fromQuery = u.searchParams.get('numeroOffre')
    const fromPath = [...seg].reverse().find(s => /^\d{5,}[A-Za-z]?$/.test(s))
    const id = fromQuery || fromPath
    if (id) return { platform: 'apec', apiUrl: `https://www.apec.fr/cms/webservices/rechercheOffre/detailOffre?numeroOffre=${encodeURIComponent(id)}` }
  }

  return null
}

// Recursively harvest job-relevant text from an arbitrary JSON payload. Used when we hit a
// site's own detail API without knowing its exact schema: pull likely title/company/location
// fields plus any long free-text (the description), strip HTML, and de-duplicate.
export function harvestJobJsonText(json) {
  const seen = new Set()
  const head = []
  const body = []
  const visit = (node, key = '') => {
    if (node == null) return
    if (typeof node === 'string') {
      const text = stripHtmlToText(htmlUnescape(node)).trim()
      if (!text || seen.has(text)) return
      if (/titre|intitul|poste|libell|fonction/i.test(key) && text.length <= 160) { seen.add(text); head.push(text) }
      else if (/entreprise|etablissement|societe|recruteur|employeur/i.test(key) && text.length <= 160) { seen.add(text); head.push(`Company: ${text}`) }
      else if (/lieu|ville|localisation|region|departement|adresse/i.test(key) && text.length <= 160) { seen.add(text); head.push(`Location: ${text}`) }
      else if (text.length >= 80) { seen.add(text); body.push(text) }
      return
    }
    if (Array.isArray(node)) { node.forEach(n => visit(n, key)); return }
    if (typeof node === 'object') { for (const [k, v] of Object.entries(node)) visit(v, k) }
  }
  visit(json)
  return [...head, ...body].join('\n').trim()
}

// Convert an ATS API JSON payload to plain job text. Returns '' when nothing usable.
export function atsJsonToText(platform, json, matchId) {
  if (!json || typeof json !== 'object') return ''
  try {
    if (platform === 'greenhouse') {
      // Greenhouse returns `content` as entity-encoded HTML — decode entities, then strip tags.
      const parts = [json.title, json.location?.name, stripHtmlToText(htmlUnescape(json.content || ''))]
      return parts.filter(Boolean).join('\n').trim()
    }
    if (platform === 'lever') {
      const lists = Array.isArray(json.lists)
        ? json.lists.map(l => `${l.text || ''}\n${stripHtmlToText(l.content || '')}`).join('\n')
        : ''
      const parts = [json.text, json.categories?.location, json.categories?.team, json.descriptionPlain || stripHtmlToText(json.description || ''), lists, json.additionalPlain]
      return parts.filter(Boolean).join('\n').trim()
    }
    if (platform === 'smartrecruiters') {
      const s = json.jobAd?.sections || {}
      const parts = [
        json.name, json.location?.city,
        s.jobDescription?.text, s.qualifications?.text, s.responsibilities?.text, s.additionalInformation?.text
      ].map(v => stripHtmlToText(v || ''))
      return parts.filter(Boolean).join('\n').trim()
    }
    if (platform === 'ashby') {
      const jobs = Array.isArray(json.jobs) ? json.jobs : []
      const job = jobs.find(j => j.id === matchId || j.jobPostingId === matchId) || null
      if (!job) return ''
      const parts = [job.title, job.location, stripHtmlToText(job.descriptionHtml || job.description || '')]
      return parts.filter(Boolean).join('\n').trim()
    }
    if (platform === 'apec') {
      // Unknown exact schema — harvest defensively so it works regardless of field names.
      return harvestJobJsonText(json.offre || json.detail || json)
    }
  } catch {
    return ''
  }
  return ''
}
