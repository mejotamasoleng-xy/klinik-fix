/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// jspdf dan jspdf-autotable dimuat secara dinamis saat pengguna mengekspor PDF agar bundle awal tetap ringan.

export interface ReportInfoItem {
  label: string;
  value: string;
}

export interface ReportTableSection {
  sectionTitle?: string;
  headers: string[];
  rows: (string | number)[][];
  columnWidths?: Record<number, number>;
  alignRightCols?: number[];
  alignCenterCols?: number[];
  emptyMessage?: string;
}

export interface SignatureConfig {
  showLeft?: boolean;
  leftTitle?: string;
  leftRole?: string;
  leftName?: string;
  leftNip?: string;
  rightDate?: string;
  rightRole?: string;
  rightName?: string;
  rightNip?: string;
}

export interface CleanReportOptions {
  title: string;
  subtitle?: string;
  periode?: string;
  orientation?: 'portrait' | 'landscape';
  fileName?: string;
  infoGrid?: ReportInfoItem[];
  tables: ReportTableSection[];
  notes?: string[];
  signature?: SignatureConfig;
}

export interface SavedSignatureDefaults {
  leftTitle?: string;
  leftName?: string;
  leftNip?: string;
  rightName?: string;
  rightNip?: string;
}

const SIGNATURE_DEFAULTS_STORAGE_KEY = 'klinik_dompu_signature_defaults_v1';

export function getDefaultIndoDate(): string {
  return new Date().toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function loadSavedSignatureDefaults(): SavedSignatureDefaults {
  try {
    const raw = localStorage.getItem(SIGNATURE_DEFAULTS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SavedSignatureDefaults;
  } catch {
    return {};
  }
}

export function saveSignatureDefaults(defaults: SavedSignatureDefaults): void {
  try {
    localStorage.setItem(SIGNATURE_DEFAULTS_STORAGE_KEY, JSON.stringify(defaults));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('klinik:signature-defaults-updated'));
    }
  } catch {
    // ignore storage errors
  }
}

export function clearSavedSignatureDefaults(): void {
  try {
    localStorage.removeItem(SIGNATURE_DEFAULTS_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('klinik:signature-defaults-updated'));
    }
  } catch {
    // ignore
  }
}

export function resolveSignatureWithDefaults(sig?: SignatureConfig): Required<SignatureConfig> {
  const saved = loadSavedSignatureDefaults();
  const hasLeftFromReport = Boolean(sig?.leftRole || sig?.leftTitle || sig?.leftName || sig?.leftNip);
  const showLeft = sig?.showLeft !== undefined ? sig.showLeft : hasLeftFromReport;

  return {
    showLeft,
    leftTitle: sig?.leftTitle ?? saved.leftTitle ?? 'Mengetahui,',
    leftRole: sig?.leftRole || 'Kepala Lembaga Pemasyarakatan Kelas IIB Dompu',
    leftName: sig?.leftName || saved.leftName || '( .................................................... )',
    leftNip: sig?.leftNip || saved.leftNip || 'NIP. .................................................',
    rightDate: sig?.rightDate || `Dompu, ${getDefaultIndoDate()}`,
    rightRole: sig?.rightRole || 'Dokter / Petugas Medis Klinik',
    rightName: sig?.rightName || saved.rightName || '( .................................................... )',
    rightNip: sig?.rightNip || saved.rightNip || 'Klinik Pratama Lapas Kelas IIB Dompu',
  };
}

export type SignaturePromptRequest = {
  mode: 'pdf' | 'print';
  options: CleanReportOptions;
};

type SignaturePromptHandler = (req: SignaturePromptRequest) => void;
let activeSignaturePromptHandler: SignaturePromptHandler | null = null;

export function registerSignaturePromptHandler(handler: SignaturePromptHandler | null): void {
  activeSignaturePromptHandler = handler;
}

let cachedEmblemDataUrl: { dataUrl: string; width: number; height: number } | null = null;

function loadImageAsDataUrl(src: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 800;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: w,
          height: h,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadKopEmblem(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (cachedEmblemDataUrl) return cachedEmblemDataUrl;
  const hd = await loadImageAsDataUrl('/assets/emblem_imipas_hd.png');
  if (hd) {
    cachedEmblemDataUrl = hd;
    return hd;
  }
  const fallback = await loadImageAsDataUrl('/logo.png');
  if (fallback) {
    cachedEmblemDataUrl = fallback;
    return fallback;
  }
  return null;
}

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Direct PDF export (called after Signature Editor confirmation or directly when no modal host is mounted).
 * Uses HD circular emblem + crisp native vector Times New Roman typography & vector double borders.
 */
export async function exportReportToPdfDirect(options: CleanReportOptions): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const orientation = options.orientation || 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const usableWidth = pageWidth - marginX * 2;
  let cursorY = 10;

  // 1. High-Definition Official Letterhead (HD Emblem + Native Vector Text)
  const emblemImg = await loadKopEmblem();
  const kopBlockWidth = Math.min(usableWidth, 174);
  const kopStartX = (pageWidth - kopBlockWidth) / 2;
  const emblemSize = 22.5;
  const emblemX = kopStartX + 2;
  const emblemY = cursorY + 1;

  if (emblemImg) {
    doc.addImage(emblemImg.dataUrl, 'PNG', emblemX, emblemY, emblemSize, emblemSize);
  }

  const textAreaLeft = emblemImg ? emblemX + emblemSize + 4 : kopStartX;
  const textCenterX = textAreaLeft + (kopStartX + kopBlockWidth - textAreaLeft) / 2;

  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'normal');
  doc.setFontSize(10.5);
  doc.text('KEMENTERIAN IMIGRASI DAN PEMASYARAKATAN RI', textCenterX, cursorY + 4, { align: 'center' });
  doc.text('DIREKTORAT JENDERAL PEMASYARAKATAN', textCenterX, cursorY + 8.5, { align: 'center' });
  doc.text('KANTOR WILAYAH NUSA TENGGARA BARAT', textCenterX, cursorY + 13, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(11.8);
  doc.text('LEMBAGA PEMASYARAKATAN KELAS IIB DOMPU', textCenterX, cursorY + 18, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(8.8);
  doc.text('Jl. Achmad Yani Km. 8 Dompu Telepon (0373) 21507 – 21508', textCenterX, cursorY + 22.2, { align: 'center' });
  doc.text('Laman: lapasdompu.kemenkumham.go.id, Surel: lp.dompu@kemenkumham.go.id', textCenterX, cursorY + 25.8, { align: 'center' });

  // Double crisp black horizontal border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.75);
  doc.line(marginX, cursorY + 28.2, pageWidth - marginX, cursorY + 28.2);
  doc.setLineWidth(0.22);
  doc.line(marginX, cursorY + 29.2, pageWidth - marginX, cursorY + 29.2);
  cursorY += 34;

  // 2. Document Title & Period
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(options.title.toUpperCase(), pageWidth / 2, cursorY + 2, { align: 'center' });
  const titleWidth = doc.getTextWidth(options.title.toUpperCase());
  doc.setLineWidth(0.35);
  doc.line((pageWidth - titleWidth) / 2, cursorY + 3, (pageWidth + titleWidth) / 2, cursorY + 3);
  cursorY += 7;

  if (options.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(options.subtitle, pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 4.5;
  }

  if (options.periode) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(options.periode, pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 6;
  } else {
    cursorY += 2;
  }

  // 3. Optional Patient / Metadata Info Grid (2 columns)
  if (options.infoGrid && options.infoGrid.length > 0) {
    const colPairs: (string | number)[][] = [];
    for (let i = 0; i < options.infoGrid.length; i += 2) {
      const left = options.infoGrid[i];
      const right = options.infoGrid[i + 1];
      colPairs.push([
        left ? `${left.label}: ${left.value}` : '',
        right ? `${right.label}: ${right.value}` : '',
      ]);
    }
    autoTable(doc, {
      startY: cursorY,
      body: colPairs,
      theme: 'plain',
      margin: { left: marginX, right: marginX },
      styles: {
        fontSize: 8,
        cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
        textColor: [20, 20, 20],
        lineColor: [200, 205, 210],
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: usableWidth / 2 },
        1: { cellWidth: usableWidth / 2 },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY) + 5;
  }

  // 4. Report Tables
  for (const tbl of options.tables) {
    if (cursorY > pageHeight - 35) {
      doc.addPage();
      cursorY = 14;
    }

    if (tbl.sectionTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(tbl.sectionTitle, marginX, cursorY);
      cursorY += 3;
    }

    const bodyRows =
      tbl.rows.length > 0
        ? tbl.rows.map((r) => r.map((cell) => String(cell ?? '-')))
        : [[tbl.emptyMessage || 'Tidak ada data untuk periode yang dipilih.']];

    const columnStyles: Record<number, any> = {};
    if (tbl.columnWidths) {
      Object.entries(tbl.columnWidths).forEach(([idx, w]) => {
        columnStyles[Number(idx)] = { ...(columnStyles[Number(idx)] || {}), cellWidth: w };
      });
    }
    if (tbl.alignRightCols) {
      tbl.alignRightCols.forEach((idx) => {
        columnStyles[idx] = { ...(columnStyles[idx] || {}), halign: 'right' };
      });
    }
    if (tbl.alignCenterCols) {
      tbl.alignCenterCols.forEach((idx) => {
        columnStyles[idx] = { ...(columnStyles[idx] || {}), halign: 'center' };
      });
    }

    autoTable(doc, {
      startY: cursorY,
      head: [tbl.headers],
      body:
        tbl.rows.length > 0
          ? bodyRows
          : bodyRows.map(
              (row) =>
                [{ content: row[0], colSpan: tbl.headers.length, styles: { halign: 'center', fontStyle: 'italic' } }] as any
            ),
      theme: 'grid',
      margin: { left: marginX, right: marginX },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
        lineColor: [100, 116, 139],
        lineWidth: 0.25,
        valign: 'middle',
      },
      bodyStyles: {
        textColor: [15, 23, 42],
        fontSize: 7.5,
        cellPadding: 2,
        lineColor: [180, 190, 200],
        lineWidth: 0.2,
        valign: 'top',
      },
      alternateRowStyles: {
        fillColor: [250, 251, 252],
      },
      columnStyles,
      didDrawPage: (data) => {
        const pageCount = doc.getNumberOfPages();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Halaman ${data.pageNumber} dari ${pageCount}`,
          pageWidth - marginX,
          pageHeight - 6,
          { align: 'right' }
        );
      },
    });

    cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY) + 6;
  }

  // 5. Optional Notes
  if (options.notes && options.notes.length > 0) {
    if (cursorY > pageHeight - 35) {
      doc.addPage();
      cursorY = 14;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text('Catatan:', marginX, cursorY);
    cursorY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    options.notes.forEach((n) => {
      const split = doc.splitTextToSize(n, usableWidth);
      doc.text(split, marginX, cursorY);
      cursorY += split.length * 3.5 + 1;
    });
    cursorY += 4;
  }

  // 6. Signature Block
  if (options.signature !== undefined) {
    const sig = resolveSignatureWithDefaults(options.signature);
    const neededHeight = 36;
    if (cursorY + neededHeight > pageHeight - 12) {
      doc.addPage();
      cursorY = 16;
    } else {
      cursorY += 4;
    }

    const leftX = marginX + usableWidth * 0.23;
    const rightX = marginX + usableWidth * 0.77;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);

    if (sig.showLeft) {
      doc.text(sig.leftTitle, leftX, cursorY, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(sig.leftRole, leftX, cursorY + 4.5, { align: 'center' });
      doc.text(sig.leftName, leftX, cursorY + 23, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(sig.leftNip, leftX, cursorY + 27, { align: 'center' });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(sig.rightDate, rightX, cursorY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(sig.rightRole, rightX, cursorY + 4.5, { align: 'center' });
    doc.text(sig.rightName, rightX, cursorY + 23, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(sig.rightNip, rightX, cursorY + 27, { align: 'center' });
  }

  const safeName = (options.fileName || options.title.replace(/[^a-zA-Z0-9]+/g, '_')).replace(/^_+|_+$/g, '');
  doc.save(`${safeName}.pdf`);
}

/**
 * Direct Isolated Print (called after Signature Editor confirmation or directly when no modal host is mounted).
 * Uses HD circular emblem + crisp Times New Roman typography & double borders.
 */
export function printIsolatedReportDirect(options: CleanReportOptions): void {
  const orientation = options.orientation || 'portrait';
  const origin = window.location.origin;
  const emblemUrl = `${origin}/assets/emblem_imipas_hd.png`;
  const logoFallbackUrl = `${origin}/logo.png`;

  const infoGridHtml =
    options.infoGrid && options.infoGrid.length > 0
      ? `
      <div class="info-grid">
        ${options.infoGrid
          .map(
            (item) => `
            <div class="info-cell">
              <span class="info-label">${escapeHtml(item.label)}</span>
              <span class="info-value">${escapeHtml(item.value)}</span>
            </div>`
          )
          .join('')}
      </div>`
      : '';

  const tablesHtml = options.tables
    .map((tbl) => {
      const thHtml = tbl.headers
        .map((h, idx) => {
          const align = tbl.alignRightCols?.includes(idx)
            ? 'text-align:right;'
            : tbl.alignCenterCols?.includes(idx)
            ? 'text-align:center;'
            : 'text-align:left;';
          return `<th style="${align}">${escapeHtml(h)}</th>`;
        })
        .join('');

      const rowsHtml =
        tbl.rows.length > 0
          ? tbl.rows
              .map(
                (r) =>
                  `<tr>${r
                    .map((cell, idx) => {
                      const align = tbl.alignRightCols?.includes(idx)
                        ? 'text-align:right;'
                        : tbl.alignCenterCols?.includes(idx)
                        ? 'text-align:center;'
                        : 'text-align:left;';
                      const formatted = escapeHtml(cell).replace(/\n/g, '<br/>');
                      return `<td style="${align}">${formatted}</td>`;
                    })
                    .join('')}</tr>`
              )
              .join('')
          : `<tr><td colspan="${tbl.headers.length}" style="text-align:center;font-style:italic;padding:14px;color:#64748b;">${escapeHtml(
              tbl.emptyMessage || 'Tidak ada data untuk periode yang dipilih.'
            )}</td></tr>`;

      return `
        <div class="table-section">
          ${tbl.sectionTitle ? `<div class="section-title">${escapeHtml(tbl.sectionTitle)}</div>` : ''}
          <table>
            <thead><tr>${thHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    })
    .join('');

  const notesHtml =
    options.notes && options.notes.length > 0
      ? `
      <div class="notes-box">
        <div class="notes-title">Catatan:</div>
        ${options.notes.map((n) => `<div>${escapeHtml(n)}</div>`).join('')}
      </div>`
      : '';

  const sig = options.signature ? resolveSignatureWithDefaults(options.signature) : null;
  const sigHtml = sig
    ? `
    <div class="signature-grid ${!sig.showLeft ? 'single-right' : ''}">
      ${
        sig.showLeft
          ? `
          <div class="sig-col">
            <div>${escapeHtml(sig.leftTitle)}</div>
            <div class="sig-role">${escapeHtml(sig.leftRole)}</div>
            <div class="sig-space"></div>
            <div class="sig-name">${escapeHtml(sig.leftName)}</div>
            <div class="sig-nip">${escapeHtml(sig.leftNip)}</div>
          </div>`
          : ''
      }
      <div class="sig-col">
        <div>${escapeHtml(sig.rightDate)}</div>
        <div class="sig-role">${escapeHtml(sig.rightRole)}</div>
        <div class="sig-space"></div>
        <div class="sig-name">${escapeHtml(sig.rightName)}</div>
        <div class="sig-nip">${escapeHtml(sig.rightNip)}</div>
      </div>
    </div>`
    : '';

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    @page {
      size: A4 ${orientation};
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .kop-container {
      width: 100%;
      margin-bottom: 12px;
    }
    .kop-inner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      max-width: 680px;
      margin: 0 auto 6px;
    }
    .kop-emblem {
      width: 76px;
      height: 76px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .kop-text {
      flex: 1;
      text-align: center;
      font-family: 'Times New Roman', Times, Georgia, serif;
      color: #000000;
      line-height: 1.25;
    }
    .kop-line-1 { font-size: 12.5px; font-weight: 400; letter-spacing: 0.3px; }
    .kop-line-2 { font-size: 12.5px; font-weight: 400; letter-spacing: 0.3px; }
    .kop-line-3 { font-size: 12.5px; font-weight: 400; letter-spacing: 0.3px; }
    .kop-line-4 { font-size: 14.5px; font-weight: 700; letter-spacing: 0.2px; margin-top: 1px; }
    .kop-addr { font-size: 10.5px; font-style: italic; margin-top: 2px; color: #111827; }
    .kop-rule-thick { border-top: 2.5px solid #000000; }
    .kop-rule-thin { border-top: 1px solid #000000; margin-top: 2px; }
    .doc-header {
      text-align: center;
      margin: 10px 0 12px;
    }
    .doc-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      text-decoration: underline;
      letter-spacing: 0.4px;
      margin: 0;
    }
    .doc-subtitle {
      font-size: 11px;
      margin: 3px 0 0;
      color: #1e293b;
    }
    .doc-periode {
      font-size: 10.5px;
      font-weight: 600;
      margin: 3px 0 0;
      color: #111827;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px 12px;
      border: 1px solid #94a3b8;
      background: #f8fafc;
      padding: 8px 10px;
      margin-bottom: 12px;
      font-size: 10px;
    }
    .info-label {
      display: block;
      font-size: 8.5px;
      text-transform: uppercase;
      color: #475569;
      font-weight: 700;
    }
    .info-value {
      font-weight: 600;
      color: #000000;
    }
    .table-section {
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 8px 0 4px;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #475569;
      padding: 5px 6px;
      vertical-align: top;
      word-break: break-word;
    }
    th {
      background: #e2e8f0;
      font-weight: 700;
      color: #000000;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .notes-box {
      margin-top: 8px;
      font-size: 9.5px;
      color: #334155;
      line-height: 1.45;
    }
    .notes-title {
      font-weight: 700;
      margin-bottom: 2px;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 24px;
      text-align: center;
      font-size: 10.5px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .signature-grid.single-right {
      grid-template-columns: 1fr;
      justify-items: end;
    }
    .signature-grid.single-right .sig-col {
      width: 240px;
    }
    .sig-role {
      font-weight: 700;
      margin-top: 2px;
    }
    .sig-space {
      height: 54px;
    }
    .sig-name {
      font-weight: 700;
      text-decoration: underline;
    }
    .sig-nip {
      font-size: 9.5px;
      color: #334155;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="kop-container">
    <div class="kop-inner">
      <img
        src="${emblemUrl}"
        alt="Logo Kementerian Imigrasi dan Pemasyarakatan RI"
        class="kop-emblem"
        onerror="this.src='${logoFallbackUrl}';"
      />
      <div class="kop-text">
        <div class="kop-line-1">KEMENTERIAN IMIGRASI DAN PEMASYARAKATAN RI</div>
        <div class="kop-line-2">DIREKTORAT JENDERAL PEMASYARAKATAN</div>
        <div class="kop-line-3">KANTOR WILAYAH NUSA TENGGARA BARAT</div>
        <div class="kop-line-4">LEMBAGA PEMASYARAKATAN KELAS IIB DOMPU</div>
        <div class="kop-addr">Jl. Achmad Yani Km. 8 Dompu Telepon (0373) 21507 – 21508</div>
        <div class="kop-addr">Laman: lapasdompu.kemenkumham.go.id, Surel: lp.dompu@kemenkumham.go.id</div>
      </div>
    </div>
    <div class="kop-rule-thick"></div>
    <div class="kop-rule-thin"></div>
  </div>

  <div class="doc-header">
    <h1 class="doc-title">${escapeHtml(options.title)}</h1>
    ${options.subtitle ? `<div class="doc-subtitle">${escapeHtml(options.subtitle)}</div>` : ''}
    ${options.periode ? `<div class="doc-periode">${escapeHtml(options.periode)}</div>` : ''}
  </div>

  ${infoGridHtml}
  ${tablesHtml}
  ${notesHtml}
  ${sigHtml}
</body>
</html>`;

  const existing = document.getElementById('klinik-isolated-print-frame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'klinik-isolated-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        iframe.remove();
      }, 1500);
    }
  };

  const img = doc.querySelector('.kop-emblem') as HTMLImageElement | null;
  if (img && !img.complete) {
    let printed = false;
    const safeTrigger = () => {
      if (printed) return;
      printed = true;
      setTimeout(triggerPrint, 60);
    };
    img.addEventListener('load', safeTrigger, { once: true });
    img.addEventListener('error', safeTrigger, { once: true });
    setTimeout(safeTrigger, 1200);
  } else {
    setTimeout(triggerPrint, 80);
  }
}

export const SIGNATURE_PROMPT_EVENT = 'klinik:open-signature-editor';
export const SIGNATURE_DEFAULTS_UPDATED_EVENT = 'klinik:signature-defaults-updated';

/**
 * Interactive PDF export: opens the Signature Footer Editor modal first so user can customize
 * the signature footer before downloading PDF.
 */
export async function exportReportToPdf(options: CleanReportOptions): Promise<void> {
  if (activeSignaturePromptHandler) {
    activeSignaturePromptHandler({ mode: 'pdf', options });
    return;
  }
  if (typeof window !== 'undefined' && (window as any).__klinikSignaturePromptReady) {
    window.dispatchEvent(
      new CustomEvent<SignaturePromptRequest>(SIGNATURE_PROMPT_EVENT, {
        detail: { mode: 'pdf', options },
      })
    );
    return;
  }
  await exportReportToPdfDirect(options);
}

/**
 * Interactive Print: opens the Signature Footer Editor modal first so user can customize
 * the signature footer before printing.
 */
export function printIsolatedReport(options: CleanReportOptions): void {
  if (activeSignaturePromptHandler) {
    activeSignaturePromptHandler({ mode: 'print', options });
    return;
  }
  if (typeof window !== 'undefined' && (window as any).__klinikSignaturePromptReady) {
    window.dispatchEvent(
      new CustomEvent<SignaturePromptRequest>(SIGNATURE_PROMPT_EVENT, {
        detail: { mode: 'print', options },
      })
    );
    return;
  }
  printIsolatedReportDirect(options);
}
