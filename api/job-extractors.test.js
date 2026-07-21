import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAtsTarget, atsJsonToText, extractJobPostingJsonLd, stripHtmlToText } from './job-extractors.js'

test('parseAtsTarget maps Greenhouse posting URLs to the boards API', () => {
  const t = parseAtsTarget('https://boards.greenhouse.io/acme/jobs/4012345?gh_src=abc')
  assert.equal(t.platform, 'greenhouse')
  assert.equal(t.apiUrl, 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345')
})

test('parseAtsTarget handles job-boards.greenhouse.io and strips id slug', () => {
  const t = parseAtsTarget('https://job-boards.greenhouse.io/acme/jobs/4012345-senior-engineer')
  assert.equal(t.platform, 'greenhouse')
  assert.equal(t.apiUrl, 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345')
})

test('parseAtsTarget maps Lever URLs', () => {
  const t = parseAtsTarget('https://jobs.lever.co/acme/1a2b3c4d-5e6f')
  assert.equal(t.platform, 'lever')
  assert.equal(t.apiUrl, 'https://api.lever.co/v0/postings/acme/1a2b3c4d-5e6f')
})

test('parseAtsTarget maps SmartRecruiters URLs and extracts numeric id', () => {
  const t = parseAtsTarget('https://jobs.smartrecruiters.com/Acme/743999912345678-data-scientist')
  assert.equal(t.platform, 'smartrecruiters')
  assert.equal(t.apiUrl, 'https://api.smartrecruiters.com/v1/companies/Acme/postings/743999912345678')
})

test('parseAtsTarget maps Ashby URLs and records the posting id to match', () => {
  const t = parseAtsTarget('https://jobs.ashbyhq.com/acme/abcd-1234-uuid')
  assert.equal(t.platform, 'ashby')
  assert.equal(t.matchId, 'abcd-1234-uuid')
  assert.match(t.apiUrl, /^https:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/acme/)
})

test('parseAtsTarget maps APEC detail URLs (path id and query id)', () => {
  const a = parseAtsTarget('https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/174557607W')
  assert.equal(a.platform, 'apec')
  assert.equal(a.apiUrl, 'https://www.apec.fr/cms/webservices/rechercheOffre/detailOffre?numeroOffre=174557607W')
  const b = parseAtsTarget('https://www.apec.fr/detailoffre?numeroOffre=999888777A')
  assert.equal(b.apiUrl, 'https://www.apec.fr/cms/webservices/rechercheOffre/detailOffre?numeroOffre=999888777A')
})

test('atsJsonToText harvests APEC-style JSON regardless of exact field names', () => {
  const json = { offre: {
    intitulePoste: 'Chef de projet digital',
    nomCommercialEtablissement: 'Acme SA',
    lieuTravail: 'Paris',
    texteHtmlOffre: '<p>Vous pilotez des projets digitaux et managez une équipe de 5 personnes sur des sujets stratégiques et transverses.</p>'
  } }
  const text = atsJsonToText('apec', json)
  assert.match(text, /Chef de projet digital/)
  assert.match(text, /Company: Acme SA/)
  assert.match(text, /Location: Paris/)
  assert.match(text, /pilotez des projets digitaux/)
  assert.doesNotMatch(text, /<p>/)
})

test('parseAtsTarget returns null for unknown or invalid URLs', () => {
  assert.equal(parseAtsTarget('https://example.com/careers/123'), null)
  assert.equal(parseAtsTarget('not a url'), null)
})

test('atsJsonToText flattens Greenhouse content HTML into text', () => {
  const json = { title: 'Senior Engineer', location: { name: 'Remote' }, content: '&lt;p&gt;Build &lt;strong&gt;great&lt;/strong&gt; things&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;/ul&gt;' }
  const text = atsJsonToText('greenhouse', json)
  assert.match(text, /Senior Engineer/)
  assert.match(text, /Remote/)
  assert.match(text, /Build/)
  assert.match(text, /Python/)
  assert.doesNotMatch(text, /<p>|<strong>/)
})

test('atsJsonToText handles Lever list structure', () => {
  const json = { text: 'Backend Dev', categories: { location: 'Berlin', team: 'Platform' }, descriptionPlain: 'We build APIs.', lists: [{ text: 'Requirements', content: '<li>Go</li><li>SQL</li>' }] }
  const text = atsJsonToText('lever', json)
  assert.match(text, /Backend Dev/)
  assert.match(text, /Berlin/)
  assert.match(text, /We build APIs/)
  assert.match(text, /Go/)
})

test('atsJsonToText picks the matching Ashby posting by id', () => {
  const json = { jobs: [
    { id: 'x', title: 'Wrong', descriptionHtml: '<p>no</p>' },
    { id: 'target', title: 'Right Role', location: 'NYC', descriptionHtml: '<p>Ship product</p>' }
  ] }
  const text = atsJsonToText('ashby', json, 'target')
  assert.match(text, /Right Role/)
  assert.match(text, /Ship product/)
  assert.doesNotMatch(text, /Wrong/)
})

test('extractJobPostingJsonLd pulls a JobPosting from an HTML page', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Data Analyst","hiringOrganization":{"name":"Acme"},"jobLocation":{"address":{"addressLocality":"Paris"}},"description":"<p>Analyze <b>data</b> and build dashboards.</p>"}</script>
    </head><body>Sign in to view</body></html>`
  const text = extractJobPostingJsonLd(html)
  assert.match(text, /Data Analyst/)
  assert.match(text, /Acme/)
  assert.match(text, /Paris/)
  assert.match(text, /Analyze data and build dashboards/)
})

test('extractJobPostingJsonLd finds JobPosting nested in an @graph array', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"X"},{"@type":"JobPosting","title":"PM","description":"Own the roadmap."}]}</script>`
  const text = extractJobPostingJsonLd(html)
  assert.match(text, /PM/)
  assert.match(text, /Own the roadmap/)
})

test('extractJobPostingJsonLd returns empty string when no JobPosting present', () => {
  assert.equal(extractJobPostingJsonLd('<script type="application/ld+json">{"@type":"WebPage"}</script>'), '')
  assert.equal(extractJobPostingJsonLd('<html>no structured data</html>'), '')
  assert.equal(extractJobPostingJsonLd('<script type="application/ld+json">{bad json}</script>'), '')
})

test('stripHtmlToText decodes entities and keeps list bullets', () => {
  const out = stripHtmlToText('<ul><li>5+ years&nbsp;Python</li><li>AWS &amp; GCP</li></ul>')
  assert.match(out, /5\+ years Python/)
  assert.match(out, /AWS & GCP/)
})
