/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface KopSuratProps {
  className?: string;
  subTitle?: string;
  periode?: string;
}

export default function KopSurat({ className = '', subTitle, periode }: KopSuratProps) {
  return (
    <div className={`w-full text-black bg-white ${className}`}>
      {/* High-Definition Official Letterhead: HD Emblem + Vector Crisp Typography */}
      <div className="max-w-[740px] mx-auto px-2 pt-1">
        <div className="flex items-center justify-center gap-3 sm:gap-5 pb-2">
          <img
            src="/assets/emblem_imipas_hd.png"
            alt="Logo Kementerian Imigrasi dan Pemasyarakatan RI"
            className="w-[68px] h-[68px] sm:w-[82px] sm:h-[82px] object-contain shrink-0 select-none"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/logo.png';
            }}
          />
          <div
            className="text-center text-black flex-1 min-w-0"
            style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
          >
            <div className="text-[11px] sm:text-[13px] font-normal uppercase tracking-[0.03em] leading-snug">
              KEMENTERIAN IMIGRASI DAN PEMASYARAKATAN RI
            </div>
            <div className="text-[11px] sm:text-[13px] font-normal uppercase tracking-[0.03em] leading-snug">
              DIREKTORAT JENDERAL PEMASYARAKATAN
            </div>
            <div className="text-[11px] sm:text-[13px] font-normal uppercase tracking-[0.03em] leading-snug">
              KANTOR WILAYAH NUSA TENGGARA BARAT
            </div>
            <div className="text-[12.5px] sm:text-[15px] font-bold uppercase tracking-[0.02em] leading-snug mt-0.5">
              LEMBAGA PEMASYARAKATAN KELAS IIB DOMPU
            </div>
            <div className="text-[9.5px] sm:text-[11px] italic leading-snug text-gray-900 mt-0.5">
              Jl. Achmad Yani Km. 8 Dompu Telepon (0373) 21507 – 21508
            </div>
            <div className="text-[9.5px] sm:text-[11px] italic leading-snug text-gray-900">
              Laman: lapasdompu.kemenkumham.go.id, Surel: lp.dompu@kemenkumham.go.id
            </div>
          </div>
        </div>

        {/* Crisp Double Line Border */}
        <div className="border-t-[2.5px] border-black" />
        <div className="border-t border-black mt-[2px] mb-3" />
      </div>

      {subTitle && (
        <div className="text-center mt-2 mb-3">
          <h2 className="text-sm font-bold uppercase underline tracking-wider text-black">
            {subTitle}
          </h2>
          {periode && (
            <p className="text-xs text-gray-700 font-medium mt-0.5">
              {periode}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
