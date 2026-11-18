import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { COMPONENT_CATALOG, ComponentMeta } from '../engine/pins';
import { ComponentType } from '../types/circuit';
import { ComponentSymbol } from './ComponentSymbol';

interface PaletteSidebarProps {
  placingType: ComponentType | null;
  onSelectPlaceType: (type: ComponentType | null) => void;
}

const CATEGORIES: Array<{ id: ComponentMeta['category']; label: string }> = [
  { id: 'source', label: 'Nguồn & Điểm chuẩn' },
  { id: 'passive', label: 'Thụ động & Hỗ cảm' },
  { id: 'dependent', label: 'Phụ thuộc & Op-Amp' },
  { id: 'network', label: 'Mạng 1 cửa & 2 cửa' },
  { id: 'threephase', label: 'Hệ thống 3 pha' },
];

export const PaletteSidebar: React.FC<PaletteSidebarProps> = ({
  placingType,
  onSelectPlaceType,
}) => {
  const [query, setQuery] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMPONENT_CATALOG;
    return COMPONENT_CATALOG.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.shortLabel.toLowerCase().includes(q) ||
        c.prefix.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [query]);

  const activeMeta = useMemo(
    () => (placingType ? COMPONENT_CATALOG.find((c) => c.type === placingType) ?? null : null),
    [placingType],
  );

  const toggleCategory = (catId: string) => {
    setCollapsedCats((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <aside
      aria-label="Thư viện phần tử mạch điện"
      className="w-64 shrink-0 bg-white border-r border-slate-200/90 flex flex-col h-full select-none"
    >
      <div className="p-3 border-b border-slate-100 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Thư viện phần tử
            </h2>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
              17+GND
            </span>
          </div>
          {placingType && (
            <button
              type="button"
              onClick={() => onSelectPlaceType(null)}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
            >
              Hủy đặt
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm điện trở, Z, op-amp, 3 pha..."
            aria-label="Tìm kiếm phần tử mạch điện"
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50/80 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Xóa từ khóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {activeMeta && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200/80 text-[11px] text-blue-900">
            <span className="truncate font-medium">Đang đặt: {activeMeta.shortLabel}</span>
            <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-white border border-blue-200 text-blue-700 shrink-0">
              Esc
            </kbd>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        {CATEGORIES.map((cat) => {
          const items = filtered.filter((c) => c.category === cat.id);
          if (items.length === 0) return null;
          const isCollapsed = !query.trim() && !!collapsedCats[cat.id];
          return (
            <section key={cat.id} aria-label={cat.label}>
              <button
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 rounded transition-colors"
              >
                <span>{cat.label}</span>
                {!query.trim() && (
                  isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )
                )}
              </button>

              {!isCollapsed && (
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {items.map((item) => {
                    const isActive = placingType === item.type;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/circuit-component', item.type);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => onSelectPlaceType(isActive ? null : item.type)}
                        title={`${item.label} — ${item.description}`}
                        className={`group flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all ${
                          isActive
                            ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500/30 text-blue-900 shadow-xs'
                            : 'bg-slate-50/50 border-slate-200/70 hover:bg-white hover:border-slate-300 hover:shadow-xs text-slate-800'
                        }`}
                      >
                        <div
                          className={`w-full h-9 rounded-md flex items-center justify-center transition-colors ${
                            isActive ? 'bg-white' : 'bg-white border border-slate-100 group-hover:border-slate-200'
                          }`}
                        >
                          <ComponentSymbol type={item.type} selected={isActive} isPaletteIcon />
                        </div>
                        <div className="w-full text-[11px] font-medium leading-tight truncate">
                          {item.shortLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-8">
            Không tìm thấy phần tử phù hợp.
          </p>
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex items-center justify-between gap-2">
        <span>Kéo hoặc nhấp đặt lên lưới</span>
        <span className="font-mono text-[10px] text-slate-400">W: Nối dây</span>
      </div>
    </aside>
  );
};
