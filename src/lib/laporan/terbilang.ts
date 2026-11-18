const SATUAN = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];

function terbilangPositif(n: number): string {
  if (n < 12) {
    return SATUAN[n];
  }
  if (n < 20) {
    return `${SATUAN[n - 10]} belas`;
  }
  if (n < 100) {
    const puluhan = Math.floor(n / 10);
    const sisa = n % 10;
    return sisa === 0
      ? `${SATUAN[puluhan]} puluh`
      : `${SATUAN[puluhan]} puluh ${terbilangPositif(sisa)}`;
  }
  if (n < 200) {
    const sisa = n - 100;
    return sisa === 0 ? 'seratus' : `seratus ${terbilangPositif(sisa)}`;
  }
  if (n < 1000) {
    const ratusan = Math.floor(n / 100);
    const sisa = n % 100;
    return sisa === 0
      ? `${SATUAN[ratusan]} ratus`
      : `${SATUAN[ratusan]} ratus ${terbilangPositif(sisa)}`;
  }
  if (n < 2000) {
    const sisa = n - 1000;
    return sisa === 0 ? 'seribu' : `seribu ${terbilangPositif(sisa)}`;
  }
  if (n < 1_000_000) {
    const ribuan = Math.floor(n / 1000);
    const sisa = n % 1000;
    return sisa === 0
      ? `${terbilangPositif(ribuan)} ribu`
      : `${terbilangPositif(ribuan)} ribu ${terbilangPositif(sisa)}`;
  }
  if (n < 1_000_000_000) {
    const jutaan = Math.floor(n / 1_000_000);
    const sisa = n % 1_000_000;
    return sisa === 0
      ? `${terbilangPositif(jutaan)} juta`
      : `${terbilangPositif(jutaan)} juta ${terbilangPositif(sisa)}`;
  }
  return String(n);
}

/**
 * Mengubah bilangan bulat >= 0 menjadi kata bilangan bahasa Indonesia huruf kecil.
 * Contoh: 0 -> "nol", 17 -> "tujuh belas", 33 -> "tiga puluh tiga"
 */
export function terbilang(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`Angka tidak valid untuk terbilang: ${n}`);
  }
  if (n === 0) return 'nol';
  return terbilangPositif(n).replace(/\s+/g, ' ').trim();
}
