/**
 * Minimal XLSX writer (no dependencies).
 *
 * Produces a workbook with inline strings (no sharedStrings part), a fixed
 * style table (header, wrapped body, plain body, merged body), frozen header
 * rows, auto filters, column widths, and merged ranges.
 */
import { createZip } from './zip.js'

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

function escapeXml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    // XML 1.0 forbids most control characters; Excel also refuses them.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '')
}

function columnName(index) {
  let name = ''
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

const INVALID_SHEET_CHARS = /[[\]:*?/\\]/gu

export function safeSheetName(name, used) {
  let cleaned = String(name ?? '')
    .replace(INVALID_SHEET_CHARS, '_')
    .trim()
    .replace(/^'+|'+$/gu, '')
  if (cleaned === '') cleaned = 'Sheet'
  cleaned = cleaned.slice(0, 31)
  const taken = new Set((used ?? []).map((item) => item.toLowerCase()))
  let candidate = cleaned
  let index = 2
  while (taken.has(candidate.toLowerCase())) {
    const suffix = `-${index}`
    candidate = cleaned.slice(0, 31 - suffix.length) + suffix
    index += 1
  }
  if (used) used.push(candidate)
  return candidate
}

function cellXml(ref, value, style) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
  }
  const text = escapeXml(value)
  if (text === '') return ''
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
}

function sheetXml(sheet) {
  const rows = sheet.rows ?? []
  const columnCount = Math.max(1, ...rows.map((row) => row.length), sheet.widths ? sheet.widths.length : 1)
  const wrapColumns = new Set(sheet.wrapColumns ?? [])
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = []
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        const value = row[columnIndex]
        const isHeader = sheet.header !== false && rowIndex === 0
        const style = isHeader ? 1 : wrapColumns.has(columnIndex) ? 2 : 3
        cells.push(cellXml(`${columnName(columnIndex)}${rowIndex + 1}`, value, style))
      }
      return `<row r="${rowIndex + 1}">${cells.join('')}</row>`
    })
    .join('')
  const cols = (sheet.widths ?? [])
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('')
  const merges = (sheet.merges ?? [])
    .map(({ r1, c1, r2, c2 }) => `<mergeCell ref="${columnName(c1)}${r1 + 1}:${columnName(c2)}${r2 + 1}"/>`)
    .join('')
  const freeze =
    sheet.freeze === false
      ? ''
      : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
  const autoFilter =
    sheet.autoFilter === false || rows.length === 0
      ? ''
      : `<autoFilter ref="A1:${columnName(columnCount - 1)}${rows.length}"/>`
  return (
    XML_HEADER +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${columnName(columnCount - 1)}${Math.max(rows.length, 1)}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rowXml}</sheetData>` +
    autoFilter +
    (merges ? `<mergeCells count="${(sheet.merges ?? []).length}">${merges}</mergeCells>` : '') +
    '</worksheet>'
  )
}

const STYLES_XML =
  XML_HEADER +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment vertical="top"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment vertical="center" wrapText="1"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

const CONTENT_TYPES =
  XML_HEADER +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
  '</Types>'

function workbookXml(names) {
  const sheets = names
    .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('')
  return (
    XML_HEADER +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheets}</sheets>` +
    '</workbook>'
  )
}

function workbookRels(count) {
  const sheetRels = Array.from(
    { length: count },
    (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('')
  return (
    XML_HEADER +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheetRels +
    `<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>'
  )
}

const ROOT_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>'

function coreXml(meta) {
  const now = new Date().toISOString().replace(/\.\d+Z$/u, 'Z')
  return (
    XML_HEADER +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(meta.title ?? '')}</dc:title>` +
    `<dc:creator>${escapeXml(meta.creator ?? 'dsh-xmind-excel')}</dc:creator>` +
    `<cp:lastModifiedBy>${escapeXml(meta.creator ?? 'dsh-xmind-excel')}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    '</cp:coreProperties>'
  )
}

const APP_XML =
  XML_HEADER +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
  'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
  '<Application>dsh-xmind-excel</Application>' +
  '</Properties>'

/**
 * Build an .xlsx file.
 * @param {{ name: string, rows: any[][], widths?: number[], wrapColumns?: number[], merges?: {r1:number,c1:number,r2:number,c2:number}[], header?: boolean, freeze?: boolean, autoFilter?: boolean }[]} sheets
 * @param {{ title?: string, creator?: string }} [meta]
 * @returns {Buffer}
 */
export function buildWorkbook(sheets, meta = {}) {
  if (!Array.isArray(sheets) || sheets.length === 0) throw new Error('workbook needs at least one sheet')
  const used = []
  const named = sheets.map((sheet) => ({ ...sheet, name: safeSheetName(sheet.name, used) }))
  const files = [
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'docProps/core.xml', data: coreXml(meta) },
    { name: 'docProps/app.xml', data: APP_XML },
    { name: 'xl/workbook.xml', data: workbookXml(named.map((sheet) => sheet.name)) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(named.length) },
    { name: 'xl/styles.xml', data: STYLES_XML },
  ]
  named.forEach((sheet, index) => files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet) }))
  return createZip(files)
}