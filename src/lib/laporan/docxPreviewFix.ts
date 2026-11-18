export type DetectedPaperSize = 'letter' | 'a4';

/**
 * Konversi sintaks path VML Microsoft Word (m, l, r, x, e) ke SVG path d="...".
 * Mendukung koordinat kosong seperti ",3683" atau "89915," yang berarti 0.
 */
export function convertVmlPathToSvgPath(vmlPath: string): string {
  const tokens = vmlPath.match(/[a-zA-Z]|-?\d*,-?\d*|-?\d+/g);
  if (!tokens) return '';

  const parsePair = (token: string): [number, number] => {
    const parts = token.split(',');
    const x = parts[0] ? parseInt(parts[0], 10) : 0;
    const y = parts[1] ? parseInt(parts[1], 10) : 0;
    return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
  };

  const out: string[] = [];
  let i = 0;
  let cmd = '';

  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[a-zA-Z]+$/.test(tok)) {
      // Kadang token huruf digabung seperti "xe" atau "em"
      for (const ch of tok) {
        if (ch === 'x') {
          out.push('Z');
          cmd = '';
        } else if (ch === 'e') {
          cmd = '';
        } else {
          cmd = ch;
        }
      }
      i++;
      continue;
    }

    if (tok.includes(',')) {
      const [x, y] = parsePair(tok);
      if (cmd === 'm') {
        out.push(`M${x},${y}`);
        cmd = 'l';
      } else if (cmd === 'l') {
        out.push(`L${x},${y}`);
      } else if (cmd === 'r') {
        out.push(`l${x},${y}`);
      } else {
        out.push(`L${x},${y}`);
      }
      i++;
      continue;
    }

    // Fallback jika angka terpisah tanpa koma (sepasang angka)
    const x = parseInt(tok, 10) || 0;
    const next = tokens[i + 1];
    const y = next && !/^[a-zA-Z]+$/.test(next) && !next.includes(',') ? parseInt(next, 10) || 0 : 0;
    if (next && !/^[a-zA-Z]+$/.test(next) && !next.includes(',')) i += 2;
    else i += 1;

    if (cmd === 'm') {
      out.push(`M${x},${y}`);
      cmd = 'l';
    } else if (cmd === 'r') {
      out.push(`l${x},${y}`);
    } else {
      out.push(`L${x},${y}`);
    }
  }

  return out.join(' ');
}

function parseVmlStyleBox(styleStr: string): {
  left: number;
  top: number;
  width: number;
  height: number;
  rawWidth?: string;
  rawHeight?: string;
} {
  const getNum = (key: string) => {
    const m = styleStr.match(new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`, 'i'));
    if (!m) return { num: 0, raw: undefined };
    const val = m[1].trim();
    return { num: parseFloat(val) || 0, raw: val };
  };
  const l = getNum('left');
  const t = getNum('top');
  const w = getNum('width');
  const h = getNum('height');
  return {
    left: l.num,
    top: t.num,
    width: w.num,
    height: h.num,
    rawWidth: w.raw,
    rawHeight: h.raw,
  };
}

function mimeFromTarget(target: string): string {
  const lower = target.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Mengekstrak Group 7 (footer BSrE / Kemenimipas berbasis VML v:group pada template
 * Sumbangan & CKG yang tidak didukung parser docx-preview) langsung dari file .docx.
 */
async function extractGroupFooterSvgs(blob: Blob): Promise<SVGSVGElement[]> {
  try {
    const [{ default: PizZip }, buf] = await Promise.all([
      import('pizzip'),
      blob.arrayBuffer(),
    ]);
    const zip = new PizZip(buf);
    const docXml = zip.file('word/document.xml')?.asText();
    if (!docXml || !docXml.includes('<v:group')) return [];

    const relsXml = zip.file('word/_rels/document.xml.rels')?.asText() || '';
    const parser = new DOMParser();
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');
    const relMap: Record<string, string> = {};
    relsDoc.querySelectorAll('Relationship').forEach((rel) => {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) relMap[id] = target;
    });

    const xmlDoc = parser.parseFromString(docXml, 'application/xml');
    const groups = Array.from(xmlDoc.getElementsByTagName('*')).filter(
      (el) => el.localName === 'group'
    );

    const results: SVGSVGElement[] = [];
    const svgNs = 'http://www.w3.org/2000/svg';

    for (const grp of groups) {
      const styleStr = grp.getAttribute('style') || '';
      const box = parseVmlStyleBox(styleStr);
      const coordParts = (grp.getAttribute('coordsize') || '1000,1000')
        .split(',')
        .map((n) => parseFloat(n) || 1);
      const gw = coordParts[0] || 31978;
      const gh = coordParts[1] || 4565;

      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('viewBox', `0 0 ${gw} ${gh}`);
      svg.setAttribute('data-laporan-vml-footer', 'true');
      svg.style.width = box.rawWidth || '251.8pt';
      svg.style.height = box.rawHeight || '35.95pt';
      svg.style.display = 'inline-block';
      svg.style.overflow = 'visible';

      const shapes = Array.from(grp.children).filter((el) => el.localName === 'shape');
      for (const sh of shapes) {
        const shBox = parseVmlStyleBox(sh.getAttribute('style') || '');
        const imagedata = Array.from(sh.children).find((el) => el.localName === 'imagedata');

        if (imagedata) {
          const rid =
            imagedata.getAttribute('r:id') ||
            imagedata.getAttributeNS(
              'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
              'id'
            );
          const relTarget = rid ? relMap[rid] : undefined;
          const mediaPath = relTarget
            ? relTarget.startsWith('word/')
              ? relTarget
              : `word/${relTarget.replace(/^\/+/, '')}`
            : undefined;
          const fileEntry = mediaPath ? zip.file(mediaPath) : null;
          if (fileEntry) {
            const u8 = fileEntry.asUint8Array();
            let bin = '';
            for (let k = 0; k < u8.length; k++) bin += String.fromCharCode(u8[k]);
            const dataUri = `data:${mimeFromTarget(mediaPath!)};base64,${btoa(bin)}`;

            const imgEl = document.createElementNS(svgNs, 'image');
            imgEl.setAttribute('href', dataUri);
            imgEl.setAttribute('x', String(shBox.left));
            imgEl.setAttribute('y', String(shBox.top));
            imgEl.setAttribute('width', String(shBox.width));
            imgEl.setAttribute('height', String(shBox.height));
            imgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.appendChild(imgEl);
          }
          continue;
        }

        const pathAttr = sh.getAttribute('path');
        if (!pathAttr) continue;
        const svgPathD = convertVmlPathToSvgPath(pathAttr);
        if (!svgPathD) continue;

        const shCoord = (sh.getAttribute('coordsize') || `${shBox.width},${shBox.height}`)
          .split(',')
          .map((n) => parseFloat(n) || 1);
        const sx = (shBox.width || gw) / (shCoord[0] || 1);
        const sy = (shBox.height || gh) / (shCoord[1] || 1);

        const g = document.createElementNS(svgNs, 'g');
        g.setAttribute('transform', `translate(${shBox.left}, ${shBox.top}) scale(${sx}, ${sy})`);

        const pathEl = document.createElementNS(svgNs, 'path');
        pathEl.setAttribute('d', svgPathD);

        const filled = sh.getAttribute('filled');
        const fillColor = sh.getAttribute('fillcolor');
        if (filled === 'f' || filled === 'false') {
          pathEl.setAttribute('fill', 'none');
        } else if (fillColor) {
          pathEl.setAttribute('fill', fillColor);
        } else {
          pathEl.setAttribute('fill', 'none');
        }

        const stroked = sh.getAttribute('stroked');
        const strokeColor = sh.getAttribute('strokecolor');
        if (stroked === 'f' || stroked === 'false') {
          pathEl.setAttribute('stroke', 'none');
        } else if (strokeColor) {
          pathEl.setAttribute('stroke', strokeColor);
          // strokeweight ~ 0.31mm in group units (~1.1pt)
          pathEl.setAttribute('stroke-width', String(Math.max(1800, (shCoord[0] || 1) * 0.0028)));
        }

        g.appendChild(pathEl);
        svg.appendChild(g);
      }

      results.push(svg);
    }

    return results;
  } catch {
    return [];
  }
}

function normalizeParagraphText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

function isBlankParagraph(el: Element): boolean {
  if (el.tagName !== 'P') return false;
  if (el.querySelector('img, svg, table')) return false;
  const text = (el.textContent || '').replace(/[\s\u00A0\u2003]/g, '');
  return text.length === 0;
}

/**
 * Jika template (seperti Rehabilitasi Daftar Hadir) memiliki Kop Surat ke-2 tepat
 * setelah section dokumentasi tanpa page-break eksplisit di DOM, pisahkan ke section baru.
 */
function splitSecondKopIntoNewSection(container: HTMLElement): void {
  const sections = Array.from(container.querySelectorAll('section.docx'));
  for (const section of sections) {
    const paragraphs = Array.from(section.querySelectorAll('p'));
    const kopStarts = paragraphs.filter((p) =>
      normalizeParagraphText(p).includes('KEMENTERIAN IMIGRASI DAN PEMASYARAKATAN RI')
    );

    if (kopStarts.length === 0) continue;

    for (const kopP of kopStarts) {
      // Cek apakah sebelum kopP sudah ada konten nyata (teks atau foto) di section ini
      const hasContentBefore = paragraphs
        .slice(0, paragraphs.indexOf(kopP))
        .some((prevP) => !isBlankParagraph(prevP) || Boolean(prevP.querySelector('img, svg')));

      if (!hasContentBefore) continue;

      const parentArticle = kopP.closest('article');
      if (!parentArticle) continue;

      const newSection = section.cloneNode(false) as HTMLElement;
      const newArticle = parentArticle.cloneNode(false) as HTMLElement;

      let cursor: ChildNode | null = kopP;
      while (cursor) {
        const next: ChildNode | null = cursor.nextSibling;
        newArticle.appendChild(cursor);
        cursor = next;
      }
      newSection.appendChild(newArticle);

      let artCursor: ChildNode | null = parentArticle.nextSibling;
      while (artCursor) {
        const nextArt: ChildNode | null = artCursor.nextSibling;
        newSection.appendChild(artCursor);
        artCursor = nextArt;
      }

      section.parentNode?.insertBefore(newSection, section.nextSibling);
      break;
    }
  }
}

/**
 * Menyelaraskan Kop Surat agar konsisten dengan Kop Surat resmi PDF lainnya:
 * logo HD di kiri tanpa menumpuk teks, 6 baris header Times New Roman rapi di tengah,
 * dan garis ganda hitam tegas di bawah alamat/laman.
 */
function normalizeKopSuratBlocks(container: HTMLElement): void {
  const allParagraphs = Array.from(container.querySelectorAll('section.docx p'));

  for (const p0 of allParagraphs) {
    if (!normalizeParagraphText(p0).includes('KEMENTERIAN IMIGRASI DAN PEMASYARAKATAN RI')) {
      continue;
    }
    if (p0.closest('.laporan-kop-block')) continue;

    // Kumpulkan maksimal 5 paragraf berikutnya yang membentuk satu blok Kop Surat
    const kopParas: HTMLElement[] = [p0 as HTMLElement];
    let curr: Element | null = p0.nextElementSibling;
    while (curr && kopParas.length < 6) {
      if (curr.tagName !== 'P') break;
      const txt = normalizeParagraphText(curr);
      if (
        txt.includes('DIREKTORAT') ||
        txt.includes('KANTOR WILAYAH') ||
        txt.includes('LEMBAGA PEMASYARAKATAN') ||
        txt.includes('Jl.') ||
        txt.includes('Laman:') ||
        txt.includes('Surel:')
      ) {
        kopParas.push(curr as HTMLElement);
        curr = curr.nextElementSibling;
      } else {
        break;
      }
    }

    if (kopParas.length < 4) continue;

    // Ambil gambar logo bawaan dari p0 (jika ada) lalu bersihkan wrapper 0px yang menyebabkan tumpang tindih
    const embeddedImg = p0.querySelector('img');
    const fallbackSrc = embeddedImg?.getAttribute('src') || '/logo.png';
    if (embeddedImg) {
      const drawingWrapper = embeddedImg.closest('div');
      if (drawingWrapper && drawingWrapper.parentElement === p0) {
        drawingWrapper.remove();
      } else {
        embeddedImg.remove();
      }
    }

    const kopWrapper = document.createElement('div');
    kopWrapper.className = 'laporan-kop-block';
    kopWrapper.style.position = 'relative';
    kopWrapper.style.display = 'flex';
    kopWrapper.style.alignItems = 'center';
    kopWrapper.style.gap = '10pt';
    kopWrapper.style.paddingTop = '1pt';
    kopWrapper.style.paddingBottom = '4pt';
    kopWrapper.style.marginBottom = '3pt';
    kopWrapper.style.width = '100%';
    kopWrapper.style.boxSizing = 'border-box';

    const logoEl = document.createElement('img');
    logoEl.src = '/assets/emblem_imipas_hd.png';
    logoEl.alt = 'Logo Kementerian Imigrasi dan Pemasyarakatan RI';
    logoEl.style.width = '58pt';
    logoEl.style.height = '58pt';
    logoEl.style.objectFit = 'contain';
    logoEl.style.flexShrink = '0';
    logoEl.style.display = 'block';
    logoEl.onerror = () => {
      if (logoEl.src !== fallbackSrc) {
        logoEl.src = fallbackSrc;
      }
    };

    const textCol = document.createElement('div');
    textCol.style.flex = '1';
    textCol.style.minWidth = '0';
    textCol.style.textAlign = 'center';
    textCol.style.fontFamily = "'Times New Roman', Times, Georgia, serif";
    textCol.style.color = '#000000';

    // Sisipkan wrapper sebelum p0
    p0.parentNode?.insertBefore(kopWrapper, p0);
    kopWrapper.appendChild(logoEl);
    kopWrapper.appendChild(textCol);

    kopParas.forEach((kp, idx) => {
      kp.style.margin = '0';
      kp.style.marginLeft = '0';
      kp.style.marginRight = '0';
      kp.style.textIndent = '0';
      kp.style.textAlign = 'center';
      kp.style.borderBottom = 'none';
      kp.style.paddingBottom = '0';
      kp.style.fontFamily = "'Times New Roman', Times, Georgia, serif";
      kp.style.color = '#000000';

      if (idx <= 2) {
        kp.style.fontSize = '10.5pt';
        kp.style.lineHeight = '1.22';
        kp.style.fontWeight = '400';
      } else if (idx === 3) {
        kp.style.fontSize = '11.5pt';
        kp.style.lineHeight = '1.26';
        kp.style.fontWeight = '700';
      } else {
        kp.style.fontSize = '8.75pt';
        kp.style.lineHeight = '1.2';
        kp.style.fontStyle = 'italic';
      }

      // Bersihkan span font Arial bawaan agar seragam Times New Roman seperti Kop PDF lain
      kp.querySelectorAll('span').forEach((sp) => {
        (sp as HTMLElement).style.fontFamily = "'Times New Roman', Times, Georgia, serif";
        (sp as HTMLElement).style.color = '#000000';
        if (idx <= 2) {
          (sp as HTMLElement).style.fontSize = '10.5pt';
          (sp as HTMLElement).style.fontWeight = '400';
        } else if (idx === 3) {
          (sp as HTMLElement).style.fontSize = '11.5pt';
          (sp as HTMLElement).style.fontWeight = '700';
        } else {
          (sp as HTMLElement).style.fontSize = '8.75pt';
          (sp as HTMLElement).style.fontStyle = 'italic';
        }
      });

      textCol.appendChild(kp);
    });

    // Garis ganda hitam resmi di bawah Kop Surat
    const doubleRule = document.createElement('div');
    doubleRule.className = 'laporan-kop-double-rule';
    doubleRule.style.marginBottom = '6pt';
    doubleRule.innerHTML =
      '<div style="border-top: 2.25pt solid #000000; width: 100%;"></div>' +
      '<div style="border-top: 0.75pt solid #000000; width: 100%; margin-top: 1.5pt;"></div>';

    kopWrapper.parentNode?.insertBefore(doubleRule, kopWrapper.nextSibling);
  }
}

/**
 * Merapikan foto dokumentasi yang menggunakan wrapSquare di template Rehabilitasi
 * agar tersusun vertikal simetris di dalam satu halaman tanpa keluar batas.
 */
function normalizeDocumentationPages(container: HTMLElement): void {
  const sections = Array.from(container.querySelectorAll('section.docx'));
  for (const section of sections) {
    const firstNonBlank = Array.from(section.querySelectorAll('p')).find(
      (p) => !isBlankParagraph(p)
    );
    if (!firstNonBlank || !normalizeParagraphText(firstNonBlank).includes('DOKUMENTASI')) {
      continue;
    }

    const imgs = Array.from(section.querySelectorAll('img'));
    if (imgs.length === 0) continue;

    // Jika template Rehabilitasi memiliki 3 foto wrapSquare ber-float / bertumpuk
    const hasFloatedPhotos = imgs.some((img) => {
      const wrapDiv = img.closest('div');
      return wrapDiv && (wrapDiv.style.float === 'left' || wrapDiv.style.float === 'right');
    });

    if (hasFloatedPhotos) {
      const hostP = imgs[0].closest('p');
      if (hostP) {
        hostP.style.display = 'flex';
        hostP.style.flexDirection = 'column';
        hostP.style.alignItems = 'center';
        hostP.style.gap = '10pt';
        hostP.style.margin = '10pt 0 0 0';
        hostP.style.textIndent = '0';

        imgs.forEach((img) => {
          const wrapDiv = img.closest('div');
          if (wrapDiv) {
            wrapDiv.style.float = 'none';
            wrapDiv.style.position = 'static';
            wrapDiv.style.display = 'block';
            wrapDiv.style.margin = '0 auto';
          }
          img.style.maxHeight = '180pt';
          img.style.width = 'auto';
          img.style.maxWidth = '100%';
          img.style.objectFit = 'contain';
        });
      }
    }
  }
}

function detectPaperSize(container: HTMLElement): DetectedPaperSize {
  const firstSection = container.querySelector('section.docx') as HTMLElement | null;
  if (!firstSection) return 'letter';
  const rect = firstSection.getBoundingClientRect();
  const styleWidth = parseFloat(firstSection.style.width || '0');
  const styleHeight = parseFloat(firstSection.style.minHeight || '0');
  // A4 = 595.3pt x 841.9pt (~794px x 1122px) vs Letter = 612pt x 792pt (~816px x 1056px)
  if ((styleHeight > 820 && styleWidth > 0 && styleWidth < 605) || rect.height > 1090 && rect.width > 0 && rect.width < 805) {
    return 'a4';
  }
  return 'letter';
}

export async function postProcessDocxPreview(
  container: HTMLElement,
  docBlob: Blob
): Promise<DetectedPaperSize> {
  // 1. Pisahkan Kop ke-2 (mis. Daftar Hadir lampiran Rehabilitasi) ke section baru jika bergabung
  splitSecondKopIntoNewSection(container);

  // 2. Rapikan seluruh Kop Surat (logo HD kiri + 6 baris Times New Roman + garis ganda)
  normalizeKopSuratBlocks(container);

  // 3. Rapikan foto dokumentasi yang memakai wrapSquare (Rehabilitasi)
  normalizeDocumentationPages(container);

  // 4. Ekstrak footer VML Group 7 (Sumbangan & CKG) dan sisipkan ke paragraf footer
  const groupSvgs = await extractGroupFooterSvgs(docBlob);
  const sections = Array.from(container.querySelectorAll('section.docx')) as HTMLElement[];

  if (groupSvgs.length > 0) {
    // Cari paragraf target footer pada section E. Penutup (memiliki margin-left ~120pt-135pt & kosong)
    for (const svg of groupSvgs) {
      let targetP: HTMLElement | null = null;
      for (const sec of sections) {
        const hasPenutupOrTtd =
          sec.textContent?.includes('Penutup') ||
          sec.textContent?.includes('ttd_pengirim') ||
          sec.textContent?.includes('M. Syaripuddin Hazri');
        if (!hasPenutupOrTtd) continue;

        const candidates = Array.from(sec.querySelectorAll('p')) as HTMLElement[];
        targetP =
          [...candidates]
            .reverse()
            .find((p) => {
              if (!isBlankParagraph(p)) return false;
              const ml = parseFloat(p.style.marginLeft || '0');
              return ml >= 100 && ml <= 200;
            }) ||
          [...candidates].reverse().find((p) => isBlankParagraph(p)) ||
          null;
        if (targetP) break;
      }

      if (targetP) {
        targetP.innerHTML = '';
        targetP.appendChild(svg);
      }
    }
  }

  // 5. Bersihkan artefak off-page (seperti margin-left > 500pt), hilangkan gap <article>,
  //    dan pastikan footer (Image 7 / Group 7) menempel rapi di bawah halaman tanpa meluber
  const paper = detectPaperSize(container);
  const targetHeightPx = paper === 'a4' ? 1122 : 1056; // 96dpi: 11.69in / 11in

  for (const sec of sections) {
    // Sembunyikan paragraf artefak tersembunyi jauh di kanan halaman (e.g. satker margin-left: 1584pt)
    sec.querySelectorAll('p').forEach((p) => {
      const ml = parseFloat((p as HTMLElement).style.marginLeft || '0');
      if (ml > 500) {
        (p as HTMLElement).style.display = 'none';
      }
    });

    // Hilangkan margin-bottom: auto pada article selain yang terakhir agar konten mengalir wajar
    const articles = Array.from(sec.children).filter(
      (ch): ch is HTMLElement => ch.tagName === 'ARTICLE'
    );
    articles.forEach((art, idx) => {
      if (idx < articles.length - 1) {
        art.style.marginBottom = '0';
      }
    });

    // Cari paragraf footer BSrE (Image 7 atau Group 7 SVG)
    const footerMedia = sec.querySelector(
      'svg[data-laporan-vml-footer="true"], img[style*="38.5pt"], img[style*="252."]'
    ) as HTMLElement | null;
    const footerP = footerMedia?.closest('p') as HTMLElement | null;

    if (footerP) {
      const footerArt = footerP.closest('article') as HTMLElement | null;
      if (footerArt) {
        // Runtuhkan paragraf-paragraf kosong berlebih tepat di atas footer agar footer tidak terdorong keluar halaman
        const psInArt = Array.from(footerArt.querySelectorAll('p')) as HTMLElement[];
        const footerIdx = psInArt.indexOf(footerP);
        for (let i = footerIdx - 1; i >= 0; i--) {
          if (isBlankParagraph(psInArt[i])) {
            psInArt[i].style.display = 'none';
          } else {
            break;
          }
        }

        footerArt.style.flex = '1 1 auto';
        footerArt.style.display = 'flex';
        footerArt.style.flexDirection = 'column';
        footerArt.style.marginBottom = '0';
      }

      footerP.style.marginTop = 'auto';
      footerP.style.marginLeft = 'auto';
      footerP.style.marginRight = 'auto';
      footerP.style.textAlign = 'center';
      footerP.style.paddingTop = '8pt';
      footerP.style.paddingBottom = '6pt';
    }

    // Untuk halaman tetap (tanpa tabel besar yang memang multi-halaman seperti peserta rehab),
    // pastikan tingginya pas dalam 1 lembar halaman agar tidak menghasilkan halaman kosong tambahan saat print PDF
    const hasBigTable =
      sec.querySelectorAll('table tr').length > 26 ||
      Boolean(sec.textContent?.includes('DAFTAR HADIR SKRINING'));
    if (hasBigTable) {
      sec.setAttribute('data-table-page', 'true');
    } else {
      sec.setAttribute('data-fixed-page', 'true');
      if (sec.scrollHeight > targetHeightPx + 4) {
        const blankPs = Array.from(sec.querySelectorAll('p')).filter((p) =>
          isBlankParagraph(p)
        ) as HTMLElement[];
        for (const bp of blankPs) {
          if (sec.scrollHeight <= targetHeightPx) break;
          bp.style.minHeight = '0.35em';
          bp.style.lineHeight = '0.9';
        }
        // Jika masih selisih tipis (<= 95px karena font sistem sedikit lebih tinggi), rapatkan margin atas/bawah tipis saja
        if (sec.scrollHeight > targetHeightPx + 2 && sec.scrollHeight <= targetHeightPx + 95) {
          const curPt = parseFloat(sec.style.paddingTop || '56');
          const curPb = parseFloat(sec.style.paddingBottom || '14');
          sec.style.paddingTop = `${Math.max(24, curPt * 0.72)}pt`;
          sec.style.paddingBottom = `${Math.max(10, curPb * 0.7)}pt`;
        }
      }
    }
  }

  return paper;
}
