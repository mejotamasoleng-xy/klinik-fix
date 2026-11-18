/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, Sun, Moon, LogOut, Settings, User, X } from 'lucide-react';
import { store } from '../lib/storage';
import { WbpItem } from '../types';

interface HeaderProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onSelectPatient: (wbp: WbpItem) => void;
  activeTabLabel: string;
}

export default function Header({
  darkMode,
  onToggleDarkMode,
  onOpenSettings,
  onLogout,
  onSelectPatient,
  activeTabLabel,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WbpItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileSearchOpen) {
      const timer = setTimeout(() => {
        mobileSearchInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [mobileSearchOpen]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const found = store.findWbpByNameOrNik(q);
    setSearchResults(found.slice(0, 6));
    setShowResults(true);
  };

  const handleSelect = (wbp: WbpItem) => {
    onSelectPatient(wbp);
    setSearchQuery('');
    setShowResults(false);
    setMobileSearchOpen(false);
  };

  const renderBadgeStyle = (batch: string) => ({
    backgroundColor:
      batch === 'Juli' ? '#FFFF99' :
      batch === 'Agustus' ? '#9FC5E8' :
      batch === 'September' ? '#B6D7A8' :
      batch === 'Oktober' ? '#FFB3DA' :
      batch === 'November' ? '#F9CB9C' : '#E2E8F0',
    color: '#1E293B',
  });

  const renderSearchResultsDropdown = () => (
    <>
      {showResults && searchResults.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 z-50 max-h-80 overflow-y-auto">
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Warga Binaan Ditemukan ({searchResults.length})
          </div>
          {searchResults.map((wbp) => (
            <button
              key={wbp.id}
              type="button"
              onClick={() => handleSelect(wbp)}
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 flex items-center justify-between gap-2 transition-colors border-b last:border-0 border-slate-100 dark:border-slate-800 min-h-[48px]"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white truncate">{wbp.nama}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                  <span>NIK: {wbp.nik || '-'}</span>
                  <span>·</span>
                  <span>{wbp.blok} / {wbp.kamar}</span>
                </div>
              </div>
              <span
                className="px-2 py-0.5 text-[10px] font-medium rounded border shrink-0"
                style={renderBadgeStyle(wbp.batch_bpjs)}
              >
                {wbp.batch_bpjs}
              </span>
            </button>
          ))}
        </div>
      )}

      {showResults && searchQuery.trim() && searchResults.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 text-center text-xs text-slate-500 z-50">
          Warga Binaan tidak ditemukan
        </div>
      )}
    </>
  );

  return (
    <header className="no-print print:hidden sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800/90">
      <div className="h-14 md:h-16 px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Active module title & breadcrumb (Logo only on mobile where sidebar is hidden) */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 md:flex-initial">
          <img
            src="/logo.png"
            alt="Logo Klinik Pratama Lapas Kelas IIB Dompu"
            className="h-7 sm:h-8 w-auto max-w-[110px] sm:max-w-[140px] object-contain shrink-0 lg:hidden"
          />
          <div className="leading-tight min-w-0">
            <div className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate">
              {activeTabLabel}
            </div>
            <div className="text-[11px] text-teal-700 dark:text-teal-400 font-medium truncate hidden sm:block">
              Klinik Pratama Lapas Kelas IIB Dompu
            </div>
          </div>
        </div>

        {/* Zone 2: Desktop Global Search Bar */}
        <div className="relative hidden md:block flex-1 max-w-md mx-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchQuery.trim() && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 180)}
              placeholder="Cari pasien (Nama / NIK / No Reg)..."
              className="w-full pl-9 pr-3 py-1.5 text-xs md:text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white dark:focus:bg-slate-900 transition-all"
            />
          </div>
          {renderSearchResultsDropdown()}
        </div>

        {/* Zone 3: Actions & Profile */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Mobile Search Toggle */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen((prev) => !prev)}
            title="Cari Pasien (Nama / NIK / No Reg)"
            aria-label="Cari Pasien"
            className={`md:hidden inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl transition-colors ${
              mobileSearchOpen
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {mobileSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>

          {/* Dark Mode toggle */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            title={darkMode ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
            aria-label={darkMode ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
            className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Settings button */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Pengaturan Sistem & Ganti Password"
            aria-label="Pengaturan Sistem"
            className="hidden sm:inline-flex items-center justify-center min-h-[40px] min-w-[40px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User tag */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300">
            <User className="w-3.5 h-3.5 text-teal-600" />
            <span>Petugas Medis</span>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            title="Keluar dari Sistem"
            aria-label="Keluar dari Sistem"
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors border border-rose-200/80 dark:border-rose-900/50"
          >
            <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>

      {/* Expandable Mobile Search Bar */}
      {mobileSearchOpen && (
        <div className="md:hidden px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 relative">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={mobileSearchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchQuery.trim() && setShowResults(true)}
              placeholder="Cari pasien (Nama / NIK / No Reg)..."
              className="w-full pl-10 pr-9 py-2.5 text-base bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white dark:focus:bg-slate-950 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
                aria-label="Bersihkan pencarian"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {renderSearchResultsDropdown()}
        </div>
      )}
    </header>
  );
}
