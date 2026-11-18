import React, { useState } from 'react';
import {
  ClipboardEdit,
  Users,
  FileSpreadsheet,
  ShieldAlert,
  LayoutDashboard,
  Settings,
  Pill,
  FileText,
  FileCheck2,
  X,
  LayoutGrid,
} from 'lucide-react';

export type TabKey =
  | 'input'
  | 'pasien'
  | 'rekap'
  | 'bpjs'
  | 'dashboard'
  | 'laporan'
  | 'master_obat'
  | 'laporan_obat'
  | 'pengaturan';

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  counts?: {
    todayVisits: number;
    totalWbp: number;
    pendingBpjs: number;
    flaggedSidb: number;
  };
}

export default function Sidebar({ activeTab, onTabChange, counts }: SidebarProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Grouped Navigation Items per user request
  const menuGroups = [
    {
      groupTitle: 'Pelayanan Klinis',
      items: [
        {
          id: 'input' as TabKey,
          label: 'Input Harian',
          desc: 'Pencatatan rawat jalan & rekam medis',
          icon: ClipboardEdit,
          badge: counts?.todayVisits ? `${counts.todayVisits} hari ini` : undefined,
          badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 font-bold',
        },
        {
          id: 'pasien' as TabKey,
          label: 'Data Pasien (WBP)',
          desc: 'Direktori 512 warga binaan',
          icon: Users,
          badge: counts?.totalWbp ? `${counts.totalWbp}` : undefined,
        },
        {
          id: 'rekap' as TabKey,
          label: 'Rekap Bulanan',
          desc: '14 Kategori & 88 Penyakit (Copy Excel)',
          icon: FileSpreadsheet,
        },
      ],
    },
    {
      groupTitle: 'Farmasi & Resep',
      items: [
        {
          id: 'master_obat' as TabKey,
          label: 'Master Obat',
          desc: 'Katalog sediaan & isi per kotak',
          icon: Pill,
        },
        {
          id: 'laporan_obat' as TabKey,
          label: 'Laporan Obat',
          desc: 'Pengeluaran obat & setara kotak',
          icon: FileText,
        },
      ],
    },
    {
      groupTitle: 'Analisis & Laporan',
      items: [
        {
          id: 'dashboard' as TabKey,
          label: 'Dashboard',
          desc: 'Analitika klinis & surveilans epidemiologi',
          icon: LayoutDashboard,
        },
        {
          id: 'bpjs' as TabKey,
          label: 'Dashboard BPJS',
          desc: 'Pengalihan Faskes & Daftar Panggil PBI',
          icon: ShieldAlert,
          badge: counts?.pendingBpjs ? `${counts.pendingBpjs} panggil` : undefined,
          badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-bold',
        },
        {
          id: 'laporan' as TabKey,
          label: 'Laporan',
          desc: 'Isi template Word bulanan & kolase foto',
          icon: FileCheck2,
        },
      ],
    },
    {
      groupTitle: 'Konfigurasi & Master Data',
      items: [
        {
          id: 'pengaturan' as TabKey,
          label: 'Pengaturan Sistem',
          desc: 'Kamus ICD-10, update SIDB, impor & akun',
          icon: Settings,
        },
      ],
    },
  ];

  const handleSelectTab = (tab: TabKey) => {
    onTabChange(tab);
    setMobileDrawerOpen(false);
  };

  const quickTabs: { id: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'input', label: 'Input', icon: ClipboardEdit },
    { id: 'master_obat', label: 'Obat', icon: Pill },
    { id: 'laporan', label: 'Laporan', icon: FileCheck2 },
    { id: 'dashboard', label: 'Dash', icon: LayoutDashboard },
  ];

  const isDrawerTabActive = ['pasien', 'rekap', 'laporan_obat', 'bpjs', 'pengaturan'].includes(activeTab);

  return (
    <>
      {/* Desktop Sidebar (hidden on mobile, visible on lg screens) */}
      <aside className="no-print print:hidden hidden lg:flex w-64 flex-col shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 select-none">
        {/* Brand Banner with Official Logo */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-center">
          <img
            src="/logo.png"
            alt="Logo Klinik Pratama Lapas Kelas IIB Dompu"
            className="h-10 w-auto max-w-[210px] object-contain"
          />
        </div>

        {/* Grouped Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {menuGroups.map((group) => (
            <div key={group.groupTitle} className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.groupTitle}
              </div>

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-semibold shadow-xs border border-teal-200/60 dark:border-teal-800/60'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'
                        }`}
                      />
                      <div className="text-left truncate">
                        <div className="truncate font-semibold">{item.label}</div>
                      </div>
                    </div>
                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded-sm font-semibold tabular-nums shrink-0 ${
                          item.badgeColor || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer Info */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-center">
          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            Klinik Pratama Lapas Dompu
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">
            Kemenimipas RI · NTB
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (Frosted glass 5-column thumb grid with safe area) */}
      <nav
        aria-label="Navigasi Utama"
        className="no-print print:hidden lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 shadow-lg pb-safe"
      >
        <div className="grid grid-cols-5 items-stretch px-1">
          {quickTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`relative flex flex-col items-center justify-center min-h-[52px] py-1.5 px-1 rounded-xl text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-teal-700 dark:text-teal-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0.5 w-6 h-0.5 rounded-full bg-teal-600 dark:bg-teal-400" />
                )}
                <Icon className="w-[18px] h-[18px] mb-0.5" />
                <span className="truncate max-w-full leading-tight">{tab.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className={`relative flex flex-col items-center justify-center min-h-[52px] py-1.5 px-1 rounded-xl text-[11px] font-medium transition-colors ${
              isDrawerTabActive || mobileDrawerOpen
                ? 'text-teal-700 dark:text-teal-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800'
            }`}
          >
            {isDrawerTabActive && (
              <span className="absolute top-0.5 w-6 h-0.5 rounded-full bg-teal-600 dark:bg-teal-400" />
            )}
            <LayoutGrid className="w-[18px] h-[18px] mb-0.5" />
            <span className="leading-tight">Menu</span>
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Sheet Menu Overlay */}
      {mobileDrawerOpen && (
        <div
          className="no-print print:hidden lg:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex flex-col justify-end"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-t-3xl px-4 pt-2.5 pb-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle Indicator */}
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto" />

            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white block">
                  Seluruh Menu Klinik Pratama
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pilih modul layanan atau laporan yang ingin dibuka
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Tutup Menu"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {menuGroups.map((group) => (
                <div key={group.groupTitle} className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                    {group.groupTitle}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectTab(item.id)}
                          className={`p-3 rounded-2xl border text-left flex flex-col justify-between gap-2 min-h-[76px] transition-colors active:scale-[0.98] ${
                            isActive
                              ? 'bg-teal-50 dark:bg-teal-950/70 border-teal-400 dark:border-teal-700 text-teal-900 dark:text-teal-200 shadow-xs'
                              : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500'
                              }`}
                            />
                            {item.badge && (
                              <span
                                className={`px-1.5 py-0.5 text-[10px] rounded font-semibold tabular-nums truncate ${
                                  item.badgeColor || 'bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs leading-snug">{item.label}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {item.desc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
