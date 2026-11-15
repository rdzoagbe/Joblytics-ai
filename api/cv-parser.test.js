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
