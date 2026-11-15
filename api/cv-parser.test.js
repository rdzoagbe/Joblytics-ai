import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCvText } from './analyze-accurate.js'

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


function makeTextPdf() {
  // Synthetic fixture: deliberately contains no real applicant data.
  const sentence = 'Joblytics PDF test fixture with selectable text that contains enough characters to verify the resume parser and avoid the empty PDF failure.'
  const stream = `BT /F1 12 Tf 50 700 Td (${sentence}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\\nstream\\n${stream}\\nendstream`
  ]
  let pdf = '%PDF-1.4\\n'
  const offsets = []
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\\n${objects[i]}\\nendobj\\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\\n0 ${objects.length + 1}\\n0000000000 65535 f \\n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \\n`
  pdf += `trailer\\n<< /Size ${objects.length + 1} /Root 1 0 R >>\\nstartxref\\n${xref}\\n%%EOF\\n`
  return Buffer.from(pdf).toString('base64')
}

test('extracts selectable text from an actual valid PDF', async () => {
  const text = await extractCvText(makeTextPdf(), 'application/pdf', 'sample.pdf')
  assert.ok(text.includes('Joblytics PDF test fixture'))
  assert.ok(text.length >= 50)
})
