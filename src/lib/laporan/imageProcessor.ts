import { DetectedPhotoSlot, TemplateInspection } from './types';

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getAttr(tag: string, attrName: string): string | null {
  const escaped = attrName.replace(/[:]/g, '\\:');
  const re = new RegExp(`\\b${escaped}="([^"]*)"`, 'i');
  const match = tag.match(re);
  return match ? match[1] : null;
}

/**
 * Membaca variabel {{...}} serta slot foto (<wp:docPr name="FOTO_n" | "KOLASE">)
 * beserta rasio wp:extent (cx/cy) dan path media target dari word/_rels/document.xml.rels.
 */
export async function inspectDocxTemplate(docxBytes: Uint8Array): Promise<TemplateInspection> {
  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip(docxBytes);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Dokumen template tidak memiliki word/document.xml');
  }
  const docXml = docFile.asText();

  // Ekstrak seluruh teks tergabung per paragraf agar variabel {{...}} yang terpecah antar <w:t> tetap terbaca
  const variablesSet = new Set<string>();
  const paragraphs = docXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [docXml];
  for (const p of paragraphs) {
    const texts = (p.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t) =>
      decodeXmlEntities(t.replace(/<[^>]+>/g, ''))
    );
    const joined = texts.join('');
    const matches = joined.match(/\{\{([^}]+)\}\}/g) || [];
    for (const m of matches) {
      const inner = m.slice(2, -2).trim().replace(/^@/, '');
      if (inner) variablesSet.add(inner);
    }
  }

  // Baca rels untuk memetakan rId -> media path
  const relsFile = zip.file('word/_rels/document.xml.rels');
  const relsXml = relsFile ? relsFile.asText() : '';
  const relMap = new Map<string, string>();
  const relTags = relsXml.match(/<Relationship\b[^>]*>/g) || [];
  for (const tag of relTags) {
    const id = getAttr(tag, 'Id');
    const target = getAttr(tag, 'Target');
    if (id && target) {
      const cleanTarget = target.startsWith('/') ? target.slice(1) : `word/${target.replace(/^\.\//, '')}`;
      relMap.set(id, cleanTarget);
    }
  }

  // Cari seluruh <w:drawing> yang merupakan FOTO_n atau KOLASE
  const photoSlots: DetectedPhotoSlot[] = [];
  const drawings = docXml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) || [];
  for (const drawing of drawings) {
    const docPrTag = drawing.match(/<wp:docPr\b[^>]*>/);
    const extentTag = drawing.match(/<wp:extent\b[^>]*>/);
    const blipTag = drawing.match(/<a:blip\b[^>]*>/);

    if (!docPrTag || !extentTag || !blipTag) continue;

    const rawName = (getAttr(docPrTag[0], 'name') || '').trim();
    const upperName = rawName.toUpperCase();
    const isKolase = upperName === 'KOLASE';
    const fotoMatch = upperName.match(/^FOTO_(\d+)$/);

    if (!isKolase && !fotoMatch) continue;

    const cx = Number(getAttr(extentTag[0], 'cx') || 0);
    const cy = Number(getAttr(extentTag[0], 'cy') || 0);
    const rId = getAttr(blipTag[0], 'r:embed') || '';
    const targetPath = relMap.get(rId) || '';

    if (cx > 0 && cy > 0 && rId && targetPath) {
      photoSlots.push({
        name: upperName,
        index: isKolase ? 0 : Number(fotoMatch![1]),
        cx,
        cy,
        aspectRatio: cx / cy,
        rId,
        targetPath,
      });
    }
  }

  photoSlots.sort((a, b) => a.index - b.index);

  return {
    variables: Array.from(variablesSet),
    photoSlots,
    hasKolase: photoSlots.some((s) => s.name === 'KOLASE'),
  };
}

async function loadImageSource(file: File | Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback ke HTMLImageElement jika browser tidak mendukung opsi imageOrientation
    }
  }

  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca gambar. Pastikan format JPG/PNG/WebP valid.'));
    };
    img.src = url;
  });
}

function drawCoverToContext(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstX: number,
  dstY: number,
  dstW: number,
  dstH: number
) {
  const targetRatio = dstW / dstH;
  const srcRatio = srcW / srcH;

  let cropW = srcW;
  let cropH = srcH;
  let cropX = 0;
  let cropY = 0;

  if (srcRatio > targetRatio) {
    // Sumber lebih lebar -> potong kiri-kanan dari tengah
    cropW = srcH * targetRatio;
    cropX = (srcW - cropW) / 2;
  } else if (srcRatio < targetRatio) {
    // Sumber lebih tinggi -> potong atas-bawah dari tengah
    cropH = srcW / targetRatio;
    cropY = (srcH - cropH) / 2;
  }

  ctx.drawImage(source, cropX, cropY, cropW, cropH, dstX, dstY, dstW, dstH);
}

/**
 * Center-crop (cover) foto ke rasio target (cx/cy) dan ekspor JPEG kualitas 0.9, lebar maks 1600px.
 */
export async function centerCropToJpegBytes(
  file: File | Blob,
  targetAspectRatio: number,
  maxWidth = 1600,
  quality = 0.9
): Promise<Uint8Array> {
  const loaded = await loadImageSource(file);
  try {
    const safeRatio = targetAspectRatio > 0 ? targetAspectRatio : 1;
    // Tentukan resolusi keluaran tanpa memperbesar berlebihan & batasi lebar maksimal 1600px
    const naturalTargetW =
      loaded.width / loaded.height > safeRatio
        ? Math.round(loaded.height * safeRatio)
        : loaded.width;
    const outWidth = Math.max(200, Math.min(maxWidth, naturalTargetW));
    const outHeight = Math.max(100, Math.round(outWidth / safeRatio));

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D tidak tersedia pada browser ini.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outWidth, outHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    drawCoverToContext(ctx, loaded.source, loaded.width, loaded.height, 0, 0, outWidth, outHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Gagal mengonversi gambar ke JPEG.'))),
        'image/jpeg',
        quality
      );
    });

    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
  } finally {
    loaded.cleanup();
  }
}

/**
 * Menyusun kolase persegi 2x2 dengan watermark kapsul biru tua di tengah atas
 * atau watermark gambar custom jika diunggah pengguna.
 */
export async function generateCollageBlob(params: {
  files: (File | null)[];
  size: number; // 1080 untuk Fasum, 1476 untuk Sumbangan
  customWatermarkFile?: File | null;
  watermarkText?: string;
}): Promise<Blob> {
  const {
    files,
    size,
    customWatermarkFile = null,
    watermarkText = 'DITJENPAS NTB LAPAS DOMPU',
  } = params;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const gap = Math.max(4, Math.round(size * 0.004));
  const cellSize = (size - gap) / 2;
  const coords = [
    { x: 0, y: 0 },
    { x: cellSize + gap, y: 0 },
    { x: 0, y: cellSize + gap },
    { x: cellSize + gap, y: cellSize + gap },
  ];

  for (let i = 0; i < 4; i++) {
    const file = files[i];
    const pos = coords[i];
    if (file) {
      const loaded = await loadImageSource(file);
      try {
        drawCoverToContext(
          ctx,
          loaded.source,
          loaded.width,
          loaded.height,
          pos.x,
          pos.y,
          cellSize,
          cellSize
        );
      } finally {
        loaded.cleanup();
      }
    } else {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(pos.x, pos.y, cellSize, cellSize);
      ctx.fillStyle = '#64748b';
      ctx.font = `600 ${Math.round(size * 0.025)}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Foto ${i + 1} belum diisi`, pos.x + cellSize / 2, pos.y + cellSize / 2);
    }
  }

  // Watermark di tengah atas
  const topMargin = Math.round(size * 0.026);
  if (customWatermarkFile) {
    const wm = await loadImageSource(customWatermarkFile);
    try {
      const maxWmWidth = size * 0.48;
      const maxWmHeight = size * 0.14;
      const scale = Math.min(maxWmWidth / wm.width, maxWmHeight / wm.height, 1);
      const w = Math.round(wm.width * scale);
      const h = Math.round(wm.height * scale);
      const x = Math.round((size - w) / 2);
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
      ctx.shadowBlur = Math.round(size * 0.012);
      ctx.shadowOffsetY = Math.round(size * 0.004);
      ctx.drawImage(wm.source, x, topMargin, w, h);
      ctx.restore();
    } finally {
      wm.cleanup();
    }
  } else {
    const fontSize = Math.round(size * 0.024);
    ctx.save();
    ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", Arial, sans-serif`;
    const textMetrics = ctx.measureText(watermarkText);
    const padX = Math.round(size * 0.032);
    const pillH = Math.round(size * 0.056);
    const pillW = Math.round(textMetrics.width + padX * 2);
    const pillX = Math.round((size - pillW) / 2);
    const pillY = topMargin;
    const radius = pillH / 2;

    // Shadow halus
    ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
    ctx.shadowBlur = Math.round(size * 0.014);
    ctx.shadowOffsetY = Math.round(size * 0.004);

    // Kapsul biru tua
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, radius);
    ctx.fillStyle = '#0f2a5c';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(2, Math.round(size * 0.0025));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();

    // Teks putih
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(watermarkText, size / 2, pillY + pillH / 2 + Math.round(size * 0.001));
    ctx.restore();
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal menyusun kolase JPEG.'))),
      'image/jpeg',
      0.9
    );
  });
}
