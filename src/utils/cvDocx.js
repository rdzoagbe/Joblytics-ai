const ACCENT = 'E07856'
const TEXT_PRIMARY = '1A1B22'
const TEXT_SECONDARY = '5C6066'

export async function generateOptimizedCvDocx(optimized, opts = {}) {
  const [{ Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle }, { saveAs }] = await Promise.all([
    import('docx'),
    import('file-saver')
  ])

  const heading = text => new Paragraph({
    spacing: { before: 240, after: 120 },
    border: { bottom: { color: ACCENT, space: 4, style: BorderStyle.SINGLE, size: 6 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: ACCENT, size: 22, font: 'Calibri' })]
  })
  const subHeading = text => new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [new TextRun({ text, bold: true, color: TEXT_PRIMARY, size: 22, font: 'Calibri' })]
  })
  const body = text => new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, color: TEXT_PRIMARY, size: 20, font: 'Calibri' })]
  })
  const bullet = text => new Paragraph({
    spacing: { after: 60 },
    bullet: { level: 0 },
    children: [new TextRun({ text, color: TEXT_PRIMARY, size: 20, font: 'Calibri' })]
  })
  const lineBreak = () => new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 100 } })

  const { fileName = 'CV-optimized.docx' } = opts
  const o = optimized || {}
  const h = o.header || {}
  const contact = h.contact || {}

  const children = []

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: h.full_name || 'Your Name', bold: true, color: TEXT_PRIMARY, size: 40, font: 'Calibri' })]
  }))

  if (h.title) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: h.title, color: ACCENT, size: 24, font: 'Calibri' })]
    }))
  }

  const contactParts = []
  if (contact.email) contactParts.push(contact.email)
  if (contact.phone) contactParts.push(contact.phone)
  if (contact.location) contactParts.push(contact.location)
  if (contact.linkedin) contactParts.push(contact.linkedin)

  if (contactParts.length > 0) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: contactParts.join('  •  '), color: TEXT_SECONDARY, size: 18, font: 'Calibri' })]
    }))
  }

  if (o.summary) {
    children.push(heading('Profile'))
    children.push(body(o.summary))
  }

  if (Array.isArray(o.experience) && o.experience.length > 0) {
    children.push(heading('Experience'))
    o.experience.forEach((exp, i) => {
      const titleLine = []
      if (exp.title) titleLine.push(exp.title)
      if (exp.company) titleLine.push(`@ ${exp.company}`)
      if (titleLine.length > 0) children.push(subHeading(titleLine.join(' ')))

      const meta = []
      if (exp.dates) meta.push(exp.dates)
      if (exp.location) meta.push(exp.location)
      if (meta.length > 0) {
        children.push(new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: meta.join(' · '), color: TEXT_SECONDARY, italics: true, size: 18, font: 'Calibri' })]
        }))
      }

      if (Array.isArray(exp.bullets)) {
        exp.bullets.forEach(b => children.push(bullet(b)))
      }
      if (i < o.experience.length - 1) children.push(lineBreak())
    })
  }

  const skills = o.skills || {}
  const hasSkills = (skills.technical?.length || 0) + (skills.soft?.length || 0) + (skills.languages?.length || 0) > 0

  if (hasSkills) {
    children.push(heading('Skills'))
    if (skills.technical?.length) {
      children.push(new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Technical: ', bold: true, color: TEXT_PRIMARY, size: 20, font: 'Calibri' }),
          new TextRun({ text: skills.technical.join(' · '), color: TEXT_PRIMARY, size: 20, font: 'Calibri' })
        ]
      }))
    }
    if (skills.soft?.length) {
      children.push(new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Soft: ', bold: true, color: TEXT_PRIMARY, size: 20, font: 'Calibri' }),
          new TextRun({ text: skills.soft.join(' · '), color: TEXT_PRIMARY, size: 20, font: 'Calibri' })
        ]
      }))
    }
    if (skills.languages?.length) {
      children.push(new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Languages: ', bold: true, color: TEXT_PRIMARY, size: 20, font: 'Calibri' }),
          new TextRun({ text: skills.languages.join(' · '), color: TEXT_PRIMARY, size: 20, font: 'Calibri' })
        ]
      }))
    }
  }

  if (Array.isArray(o.education) && o.education.length > 0) {
    children.push(heading('Education'))
    o.education.forEach(edu => {
      if (edu.degree) children.push(subHeading(edu.degree))
      const eduMeta = []
      if (edu.institution) eduMeta.push(edu.institution)
      if (edu.location) eduMeta.push(edu.location)
      if (edu.dates) eduMeta.push(edu.dates)
      if (eduMeta.length > 0) {
        children.push(new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: eduMeta.join(' · '), color: TEXT_SECONDARY, italics: true, size: 18, font: 'Calibri' })]
        }))
      }
    })
  }

  children.push(lineBreak())
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '— Optimized with Joblytics — Review carefully before sending —', color: '999999', size: 14, italics: true, font: 'Calibri' })]
  }))

  const doc = new Document({
    creator: 'Joblytics',
    title: 'Optimized CV',
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children }]
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, fileName)
}

// ATS-friendly single-column PDF of the full optimized resume (same structure as the DOCX).
// Text-based (no images/tables/columns) so applicant tracking systems can parse it.
export async function generateOptimizedCvPdf(optimized, opts = {}) {
  const { jsPDF } = await import('jspdf')
  const o = optimized || {}
  const h = o.header || {}
  const contact = h.contact || {}
  const { fileName = 'CV-optimized.pdf' } = opts

  const ACCENT_RGB = [224, 120, 86]
  const PRIMARY_RGB = [26, 27, 34]
  const MUTED_RGB = [92, 96, 102]
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 48
  const width = pageW - margin * 2
  let y = 56

  const ensureSpace = need => { if (y + need > pageH - 48) { pdf.addPage(); y = 56 } }

  const text = (str, { size = 10, color = PRIMARY_RGB, bold = false, italic = false, gap = 14, align = 'left', indent = 0 } = {}) => {
    const value = clean(str)
    if (!value) return
    let style = 'normal'
    if (bold && italic) style = 'bolditalic'
    else if (bold) style = 'bold'
    else if (italic) style = 'italic'
    pdf.setFont('helvetica', style)
    pdf.setFontSize(size)
    pdf.setTextColor(color[0], color[1], color[2])
    const maxW = width - indent
    const lines = pdf.splitTextToSize(value, maxW)
    lines.forEach(line => {
      ensureSpace(gap)
      if (align === 'center') pdf.text(line, pageW / 2, y, { align: 'center' })
      else pdf.text(line, margin + indent, y)
      y += gap
    })
  }

  const section = title => {
    y += 10
    ensureSpace(24)
    text(title.toUpperCase(), { size: 10.5, color: ACCENT_RGB, bold: true, gap: 13 })
    pdf.setDrawColor(ACCENT_RGB[0], ACCENT_RGB[1], ACCENT_RGB[2])
    pdf.setLineWidth(0.8)
    pdf.line(margin, y - 6, margin + width, y - 6)
    y += 6
  }

  // Header
  text(h.full_name || 'Your Name', { size: 20, bold: true, align: 'center', gap: 24 })
  if (h.title) text(h.title, { size: 11.5, color: ACCENT_RGB, align: 'center', gap: 16 })
  const contactParts = [contact.email, contact.phone, contact.location, contact.linkedin].map(clean).filter(Boolean)
  if (contactParts.length) text(contactParts.join('   •   '), { size: 9, color: MUTED_RGB, align: 'center', gap: 16 })

  if (o.summary) { section('Profile'); text(o.summary, { size: 10, gap: 14 }) }

  if (Array.isArray(o.experience) && o.experience.length) {
    section('Experience')
    o.experience.forEach((exp, i) => {
      const titleLine = [clean(exp.title), exp.company ? `@ ${clean(exp.company)}` : ''].filter(Boolean).join(' ')
      ensureSpace(30)
      if (titleLine) text(titleLine, { size: 11, bold: true, gap: 14 })
      const meta = [clean(exp.dates), clean(exp.location)].filter(Boolean).join('  ·  ')
      if (meta) text(meta, { size: 9, color: MUTED_RGB, italic: true, gap: 13 })
      if (Array.isArray(exp.bullets)) exp.bullets.map(clean).filter(Boolean).forEach(b => text(`•  ${b}`, { size: 10, gap: 14, indent: 8 }))
      if (i < o.experience.length - 1) y += 6
    })
  }

  const skills = o.skills || {}
  const skillLine = (label, arr) => {
    const items = Array.isArray(arr) ? arr.map(clean).filter(Boolean) : []
    if (!items.length) return
    ensureSpace(16)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...PRIMARY_RGB)
    const labelText = `${label}: `
    const labelW = pdf.getTextWidth(labelText)
    pdf.text(labelText, margin, y)
    pdf.setFont('helvetica', 'normal')
    const lines = pdf.splitTextToSize(items.join(' · '), width - labelW)
    lines.forEach((line, idx) => {
      if (idx > 0) ensureSpace(14)
      pdf.text(line, idx === 0 ? margin + labelW : margin, y)
      y += 14
    })
  }
  if ((skills.technical?.length || 0) + (skills.soft?.length || 0) + (skills.languages?.length || 0) > 0) {
    section('Skills')
    skillLine('Technical', skills.technical)
    skillLine('Soft', skills.soft)
    skillLine('Languages', skills.languages)
  }

  if (Array.isArray(o.education) && o.education.length) {
    section('Education')
    o.education.forEach(edu => {
      if (edu.degree) text(clean(edu.degree), { size: 11, bold: true, gap: 14 })
      const meta = [clean(edu.institution), clean(edu.location), clean(edu.dates)].filter(Boolean).join('  ·  ')
      if (meta) text(meta, { size: 9, color: MUTED_RGB, italic: true, gap: 14 })
    })
  }

  y += 12
  text('— Optimized with Joblytics — Review carefully before sending —', { size: 8, color: MUTED_RGB, italic: true, align: 'center', gap: 12 })

  pdf.save(fileName)
}
