import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCvText } from '../api/analyze-accurate.js'

test('PDF upload rejects invalid magic bytes with a useful error', async () => {
  const bytes = Buffer.from('Not actually a pdf despite a .pdf extension').toString('base64')
  await assert.rejects(extractCvText(bytes, 'application/pdf', 'resume.pdf'),
    err => err.statusCode === 400 && err.code === 'CV_INVALID_PDF')
})

test('PDF extension is accepted when browser MIME is empty', async () => {
  const bytes = Buffer.from('Not actually a PDF').toString('base64')
  await assert.rejects(extractCvText(bytes, '', 'resume.PDF'),
    err => err.code === 'CV_INVALID_PDF')
})

test('Empty file is rejected before parsing', async () => {
  await assert.rejects(extractCvText('', 'application/pdf', 'resume.pdf'),
    err => err.statusCode === 400 && err.code === 'CV_EMPTY_FILE')
})

test('Unsupported upload format is rejected before processing', async () => {
  await assert.rejects(extractCvText(Buffer.from('test').toString('base64'), 'image/png', 'cv.png'),
    err => err.statusCode === 400 && err.code === 'UNSUPPORTED_FILE_TYPE')
})


// A ReportLab-generated, text-based test PDF containing synthetic data only.
const REPORTLAB_PDF_BASE64 = 'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCA2IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNiAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYxMTE1MTcxNTU1KzAwJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYxMTE1MTcxNTU1KzAwJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKNyAwIG9iago8PAovTGVuZ3RoIDE4NQo+PgpzdHJlYW0KMSAwIDAgMSAwIDAgY20gIEJUIC9GMSAxMiBUZiAxNC40IFRMIEVUCkJUIDEgMCAwIDEgNTAgNzAwIFRtIChKb2JseXRpY3MgUERGIGZpeHR1cmUgY29udGFpbmluZyBhIGxvbmcgdGVzdCBsaW5lIHdpdGggbW9yZSB0aGFuIGZpZnR5IGNoYXJhY3RlcnMgb2YgcmVhZGFibGUgc2VsZWN0YWJsZSB0ZXh0LikgVGogVCogRVQKIAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMDkyIDAwMDAwIG4gCjAwMDAwMDAxOTkgMDAwMDAgbiAKMDAwMDAwMDM5MiAwMDAwMCBuIAowMDAwMDAwNDYwIDAwMDAwIG4gCjAwMDAwMDA3MjEgMDAwMDAgbiAKMDAwMDAwMDc4MCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzw4ZGU2NjQyMDBmNjdhM2I3MWMxMzgzZWUzMDg5MWZlOT48OGRlNjY0MjAwZjY3YTNiNzFjMTM4M2VlMzA4OTFmZTk+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDUgMCBSCi9Sb290IDQgMCBSCi9TaXplIDgKPj4Kc3RhcnR4cmVmCjEwMTUKJSVFT0YK'

test('extracts selectable text from a standards-compliant PDF', async () => {
  const text = await extractCvText(REPORTLAB_PDF_BASE64, 'application/pdf', 'sample.pdf')
  assert.ok(text.includes('Joblytics PDF fixture'))
  assert.ok(text.length >= 50)
})
