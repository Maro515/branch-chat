// AIの回答（Markdown）を DOCX / PPTX に変換する（デスクトップ版）。
// AIにファイル操作をさせず、BranCHAT 側で組み立てるので安全で一瞬。レイアウトは定型（見出し・本文・箇条書き・表）。
'use strict';
const docx = require('docx');
const PptxGenJS = require('pptxgenjs');

// ---- Markdown を簡易ブロックに ----
function parse(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const out = []; let i = 0;
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const L = lines[i]; let m;
    if (/^\s*```/.test(L)) { const buf = []; let j = i + 1; while (j < lines.length && !/^\s*```/.test(lines[j])) { buf.push(lines[j]); j++; } out.push({ t: 'code', text: buf.join('\n') }); i = j + 1; continue; }
    if (isRow(L) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) { const rows = []; let j = i; while (j < lines.length && isRow(lines[j])) { rows.push(lines[j]); j++; } out.push({ t: 'table', head: cells(rows[0]), body: rows.slice(2).map(cells) }); i = j; continue; }
    if ((m = L.match(/^\s*(#{1,4})\s+(.*)$/))) { out.push({ t: 'h', level: m[1].length, text: m[2] }); i++; continue; }
    if ((m = L.match(/^(\s*)[-*・]\s+(.*)$/))) { out.push({ t: 'li', sub: m[1].length >= 2, text: m[2] }); i++; continue; }
    if ((m = L.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) { out.push({ t: 'ol', sub: m[1].length >= 2, text: m[3] }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(L)) { out.push({ t: 'hr' }); i++; continue; }
    if ((m = L.match(/^\s*>\s?(.*)$/))) { out.push({ t: 'quote', text: m[1] }); i++; continue; }
    if (L.trim()) out.push({ t: 'p', text: L }); else out.push({ t: 'blank' });
    i++;
  }
  return out;
}
// **太字** と `コード` を runs に
function runs(text, base = {}) {
  const parts = []; const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), ...base });
    const s = m[0];
    if (s.startsWith('**')) parts.push({ text: s.slice(2, -2), ...base, bold: true }); else parts.push({ text: s.slice(1, -1), ...base, font: 'Menlo' });
    last = m.index + s.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), ...base });
  return parts.length ? parts : [{ text, ...base }];
}
const plain = (t) => String(t).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');

// ---- DOCX ----
async function toDocx({ title, sections }) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = docx;
  const children = [];
  const H = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  for (const sec of sections) {
    if (sec.heading) children.push(new Paragraph({ text: sec.heading, heading: HeadingLevel.HEADING_1 }));
    for (const b of parse(sec.markdown)) {
      if (b.t === 'h') children.push(new Paragraph({ text: plain(b.text), heading: H[Math.min(3, b.level)] }));
      else if (b.t === 'p') children.push(new Paragraph({ children: runs(b.text).map((r) => new TextRun({ text: r.text, bold: r.bold, font: r.font })), spacing: { after: 120 } }));
      else if (b.t === 'li') children.push(new Paragraph({ children: runs(b.text).map((r) => new TextRun({ text: r.text, bold: r.bold, font: r.font })), bullet: { level: b.sub ? 1 : 0 } }));
      else if (b.t === 'ol') children.push(new Paragraph({ children: runs(b.text).map((r) => new TextRun({ text: r.text, bold: r.bold, font: r.font })), numbering: { reference: 'nums', level: b.sub ? 1 : 0 } }));
      else if (b.t === 'quote') children.push(new Paragraph({ children: [new TextRun({ text: plain(b.text), italics: true, color: '555555' })], indent: { left: 720 } }));
      else if (b.t === 'code') children.push(new Paragraph({ children: [new TextRun({ text: b.text, font: 'Menlo', size: 18 })], shading: { fill: 'F3F4F6' } }));
      else if (b.t === 'hr') children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } } }));
      else if (b.t === 'table') {
        const n = b.head.length; const TOTAL = 9000; const cw = Math.floor(TOTAL / n); // A4 の本文幅(約9000 dxa)を等分。QuickLook や一部ビューアは % 幅を無視するので実寸で指定
        const mk = (cellsArr, bold) => new TableRow({ children: cellsArr.map((c) => new TableCell({ width: { size: cw, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: plain(c), bold })] })], shading: bold ? { fill: 'E8EEF9' } : undefined })) });
        const rows = [mk(b.head, true), ...b.body.map((r) => mk([...r, ...Array(Math.max(0, n - r.length)).fill('')].slice(0, n), false))];
        children.push(new Table({ rows, width: { size: TOTAL, type: WidthType.DXA }, columnWidths: Array(n).fill(cw) }), new Paragraph({ text: '' }));
      } else if (b.t === 'blank') children.push(new Paragraph({ text: '' }));
    }
  }
  const doc = new Document({
    numbering: { config: [{ reference: 'nums', levels: [0, 1].map((lv) => ({ level: lv, format: 'decimal', text: '%' + (lv + 1) + '.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (lv + 1), hanging: 360 } } } })) }] },
    styles: { default: { document: { run: { font: 'Hiragino Sans', size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

// ---- PPTX ----
async function toPptx({ title, sections }) {
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_16x9';
  const NAVY = '1E3A6E', INK = '1C1F24', SKY = '0369A1';
  const font = 'Hiragino Sans';
  if (title) { const s = pptx.addSlide(); s.background = { color: NAVY }; s.addText(title, { x: 0.6, y: 1.6, w: 8.8, h: 1.6, fontSize: 32, bold: true, color: 'FFFFFF', fontFace: font }); s.addText('BranCHAT で作成', { x: 0.6, y: 3.6, w: 8.8, h: 0.5, fontSize: 14, color: 'BFD3F2', fontFace: font }); }
  // スライド = 見出し(#/##)ごと。見出しが無ければ12行ごとに区切る
  const pages = [];
  for (const sec of sections) {
    let cur = { title: sec.heading || title || '', items: [] };
    for (const b of parse(sec.markdown)) {
      if (b.t === 'h' && b.level <= 2) { if (cur.items.length) pages.push(cur); cur = { title: plain(b.text), items: [] }; continue; }
      if (b.t === 'blank') continue;
      cur.items.push(b);
      if (cur.items.filter((x) => x.t !== 'table').length >= 12) { pages.push(cur); cur = { title: cur.title + '（続き）', items: [] }; }
    }
    if (cur.items.length) pages.push(cur);
  }
  for (const pg of pages) {
    const s = pptx.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.9, fill: { color: NAVY } });
    s.addText(pg.title || ' ', { x: 0.4, y: 0.1, w: 9.2, h: 0.7, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: font });
    let y = 1.15;
    const textItems = pg.items.filter((b) => b.t !== 'table');
    if (textItems.length) {
      const arr = [];
      for (const b of textItems) {
        const base = { fontSize: 15, color: INK, fontFace: font, breakLine: true };
        if (b.t === 'h') arr.push({ text: plain(b.text), options: { ...base, bold: true, color: SKY } });
        else if (b.t === 'li' || b.t === 'ol') arr.push(...runs(b.text).map((r, i, a) => ({ text: r.text, options: { ...base, bold: !!r.bold, bullet: i === 0 ? (b.t === 'ol' ? { type: 'number' } : true) : undefined, indentLevel: b.sub ? 1 : 0, breakLine: i === a.length - 1 } })));
        else if (b.t === 'code') arr.push({ text: b.text, options: { ...base, fontFace: 'Menlo', fontSize: 12 } });
        else arr.push(...runs(b.text).map((r, i, a) => ({ text: r.text, options: { ...base, bold: !!r.bold, breakLine: i === a.length - 1 } })));
      }
      const h = Math.min(4.1, 0.32 * textItems.length + 0.3);
      s.addText(arr, { x: 0.5, y, w: 9, h, valign: 'top', fit: 'shrink', paraSpaceAfter: 4 });
      y += h + 0.1;
    }
    for (const b of pg.items.filter((x) => x.t === 'table')) {
      const n = b.head.length;
      const rows = [b.head.map((c) => ({ text: plain(c), options: { bold: true, fill: { color: 'E8EEF9' }, color: NAVY, fontFace: font, fontSize: 12 } })),
        ...b.body.map((r) => [...r, ...Array(Math.max(0, n - r.length)).fill('')].slice(0, n).map((c) => ({ text: plain(c), options: { fontFace: font, fontSize: 11, color: INK } })))];
      const h = Math.min(5.3 - y, 0.35 * rows.length + 0.2);
      s.addTable(rows, { x: 0.5, y, w: 9, colW: Array(n).fill(9 / n), border: { type: 'solid', pt: 0.75, color: 'B7C6E6' }, autoPage: false });
      y += h + 0.15;
    }
  }
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));
}

module.exports = { toDocx, toPptx, parse };
