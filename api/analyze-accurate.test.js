import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkedInJobId, parseLinkedInGuestHtml } from './analyze-accurate.js'

test('linkedInJobId extracts the job id from common LinkedIn URL shapes', () => {
  assert.equal(linkedInJobId('https://www.linkedin.com/jobs/view/4418753634/'), '4418753634')
  assert.equal(linkedInJobId('https://www.linkedin.com/jobs/view/senior-engineer-at-acme-4418753634'), '4418753634')
  assert.equal(linkedInJobId('https://www.linkedin.com/jobs/search/?currentJobId=4418753634'), '4418753634')
  assert.equal(linkedInJobId('https://fr.linkedin.com/jobs/view/4418753634'), '4418753634')
  assert.equal(linkedInJobId('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4418753634'), '4418753634')
})

test('linkedInJobId returns null for non-LinkedIn or non-job URLs', () => {
  assert.equal(linkedInJobId('https://example.com/jobs/view/4418753634'), null)
  assert.equal(linkedInJobId('https://www.linkedin.com/feed/'), null)
  assert.equal(linkedInJobId(''), null)
  assert.equal(linkedInJobId(null), null)
})

test('parseLinkedInGuestHtml extracts the description and drops login chrome', () => {
  const html = `
    <div class="top-card-layout__entity-info">
      <h2 class="top-card-layout__title">Senior DevOps Engineer</h2>
      <a class="topcard__org-name-link" href="#">Acme Corp</a>
    </div>
    <div class="description__text description__text--rich">
      <div class="show-more-less-html__markup">
        We are looking for a Senior DevOps engineer with strong experience in AWS,
        Kubernetes, Docker, Terraform, CI/CD pipelines, Python and monitoring. You will
        manage cloud infrastructure, ensure security and compliance, and lead incident
        management for the platform team. Five years of experience required.
      </div>
      <button class="show-more-less-html__button">Show more</button>
    </div>
    <section class="jobs-description__footer">
      <h3>Sign in to set job alerts for "DevOps Engineer" roles.</h3>
      <a href="#">Join now</a><a href="#">Sign in</a>
    </section>`
  const text = parseLinkedInGuestHtml(html)
  assert.ok(text)
  assert.ok(/Senior DevOps Engineer/.test(text), 'includes title')
  assert.ok(/Acme Corp/.test(text), 'includes company')
  assert.ok(/Kubernetes/.test(text) && /incident\s+management/i.test(text), 'includes description')
  assert.ok(!/set job alerts/i.test(text), 'drops the login/alert chrome')
  assert.ok(!/Join now/i.test(text), 'drops join chrome')
})

test('parseLinkedInGuestHtml returns null for a login wall fragment', () => {
  const wall = '<div class="authwall"><h1>Sign in to continue to LinkedIn</h1><a>Join now</a></div>'
  assert.equal(parseLinkedInGuestHtml(wall), null)
})
