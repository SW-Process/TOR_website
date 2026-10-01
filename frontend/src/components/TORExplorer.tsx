"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import TORCard from "./TORCard";
import { categories, daysUntil, formatBudget, type TOR } from "@/lib/mockData";
import { fetchTorList, searchTors } from "@/lib/torApi";
import {
  activeFilterCount as countActive,
  STATUSES,
  toApiParams,
  toUrlParams,
  type SortKey,
  type TorFilters,
} from "@/lib/torSearch";

const EMPTY_FILTERS: Omit<TorFilters, "q" | "sort"> = {
  categories: [],
  agencies: [],
  statuses: [],
  budgetMin: "",
  budgetMax: "",
  publishedFrom: "",
  publishedTo: "",
};

/** Wait this long after the last keystroke before re-querying the backend. */
const SEARCH_DEBOUNCE_MS = 300;

export default function TORExplorer({ initialFilters }: { initialFilters: TorFilters }) {
  const [filters, setFilters] = useState<TorFilters>(initialFilters);
  const update = (patch: Partial<TorFilters>) => setFilters((f) => ({ ...f, ...patch }));

  // Unfiltered list: only feeds the total count and the agency checkbox options,
  // so picking one agency doesn't make the others disappear from the panel.
  const [allTors, setAllTors] = useState<TOR[]>([]);
  useEffect(() => {
    fetchTorList().then(setAllTors);
  }, []);

  const agencies = useMemo(
    () =>
      [...new Set([...allTors.map((t) => t.agency), ...filters.agencies])].sort((a, b) =>
        a.localeCompare(b, "th")
      ),
    [allTors, filters.agencies]
  );

  // Keep the URL in sync without a navigation/re-render, so refresh, share and
  // back restore the same search.
  const urlQuery = toUrlParams(filters).toString();
  useEffect(() => {
    const next = urlQuery ? `?${urlQuery}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [urlQuery]);

  // One combined backend query for keyword + category + agency + budget + dates.
  const apiQuery = toApiParams(filters).toString();
  const [matched, setMatched] = useState<TOR[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchTors(new URLSearchParams(apiQuery), controller.signal)
        .then(({ tors, totalCount }) => {
          setMatched(tors);
          setTotalCount(totalCount);
          setError(false);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setError(true);
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiQuery]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  function toggle<K extends "categories" | "agencies" | "statuses">(key: K, value: TorFilters[K][number]) {
    setFilters((f) => {
      const list = f[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...f, [key]: next };
    });
  }

  // Status is derived from the deadline client-side, and the backend only sorts
  // by announcement date, so these two are applied to the returned rows.
  const results = useMemo(() => {
    const list = matched.filter(
      (tor) => filters.statuses.length === 0 || filters.statuses.includes(tor.status)
    );
    return [...list].sort((a, b) => {
      switch (filters.sort) {
        case "deadline":
          return daysUntil(a.deadline) - daysUntil(b.deadline);
        case "budgetDesc":
          return b.budget - a.budget;
        case "budgetAsc":
          return a.budget - b.budget;
        default:
          return a.announceDate < b.announceDate ? 1 : -1;
      }
    });
  }, [matched, filters.statuses, filters.sort]);

  const activeFilterCount = countActive(filters);

  function clearFilters() {
    update(EMPTY_FILTERS);
  }

  const filterPanel = (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-heading)] font-semibold text-[var(--color-text)]">
          ตัวกรอง
        </h3>
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-xs font-semibold text-[var(--color-rose-dark)] hover:underline"
          >
            ล้างตัวกรอง ({activeFilterCount})
          </button>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">สถานะ</p>
        <div className="flex flex-col gap-2">
          {STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={filters.statuses.includes(s)}
                onChange={() => toggle("statuses", s)}
                className="rounded border-[var(--color-border)] accent-[var(--color-rose-dark)]"
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">หมวดหมู่</p>
        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={filters.categories.includes(c)}
                onChange={() => toggle("categories", c)}
                className="rounded border-[var(--color-border)] accent-[var(--color-rose-dark)]"
              />
              {c}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">หน่วยงาน</p>
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
          {agencies.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={filters.agencies.includes(a)}
                onChange={() => toggle("agencies", a)}
                className="rounded border-[var(--color-border)] accent-[var(--color-rose-dark)]"
              />
              {a}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">งบประมาณ (บาท)</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="ต่ำสุด"
            min={0}
            value={filters.budgetMin}
            onChange={(e) => update({ budgetMin: e.target.value.replace(/\D/g, "") })}
            className="w-full rounded-full border border-[var(--color-border)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
          />
          <span className="text-[var(--color-text-muted)]">–</span>
          <input
            type="number"
            placeholder="สูงสุด"
            min={0}
            value={filters.budgetMax}
            onChange={(e) => update({ budgetMax: e.target.value.replace(/\D/g, "") })}
            className="w-full rounded-full border border-[var(--color-border)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">วันที่ประกาศ</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span className="w-8 shrink-0">ตั้งแต่</span>
            <input
              type="date"
              value={filters.publishedFrom}
              max={filters.publishedTo || undefined}
              onChange={(e) => update({ publishedFrom: e.target.value })}
              className="w-full rounded-full border border-[var(--color-border)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span className="w-8 shrink-0">ถึง</span>
            <input
              type="date"
              value={filters.publishedTo}
              min={filters.publishedFrom || undefined}
              onChange={(e) => update({ publishedTo: e.target.value })}
              className="w-full rounded-full border border-[var(--color-border)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
            />
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
          ค้นหาประกาศจัดซื้อจัดจ้าง (TOR)
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
          พบทั้งหมด {allTors.length} โครงการ จากหน่วยงานในสังกัดกรุงเทพมหานคร
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-5 py-1 shadow-[var(--shadow-sm)]">
        <Search size={18} className="text-[var(--color-text-faint)]" />
        <input
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="ค้นหาชื่อโครงการ, หน่วยงาน หรือเลขที่โครงการ"
          className="w-full py-3 text-sm focus:outline-none"
        />
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="btn-pill lg:hidden border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] shrink-0"
        >
          <SlidersHorizontal size={15} />
          ตัวกรอง {activeFilterCount > 0 && `(${activeFilterCount})`}
        </button>
      </div>

      <div className="mt-6 grid lg:grid-cols-[260px_1fr] gap-8">
        <aside className="hidden lg:block card p-5 h-fit sticky top-24">{filterPanel}</aside>

        {filtersOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setFiltersOpen(false)}>
            <div
              className="absolute right-0 top-0 h-full w-[85%] max-w-sm overflow-y-auto bg-white p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-end mb-2">
                <button onClick={() => setFiltersOpen(false)} aria-label="ปิด">
                  <X size={20} />
                </button>
              </div>
              {filterPanel}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              พบ <span className="font-semibold text-[var(--color-text)]">{results.length}</span> รายการ
            </p>
            <select
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as SortKey })}
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
            >
              <option value="newest">ประกาศล่าสุด</option>
              <option value="deadline">ใกล้ปิดรับก่อน</option>
              <option value="budgetDesc">งบประมาณ: มาก-น้อย</option>
              <option value="budgetAsc">งบประมาณ: น้อย-มาก</option>
            </select>
          </div>

          {loading ? (
            <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">
              กำลังโหลด TOR...
            </div>
          ) : error ? (
            <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">
              โหลดผลการค้นหาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
            </div>
          ) : results.length === 0 ? (
            <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">
              ไม่พบ TOR ที่ตรงกับเงื่อนไขการค้นหา ลองปรับตัวกรองหรือคำค้นหาใหม่
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="block mx-auto mt-3 text-[var(--color-rose-dark)] font-semibold hover:underline"
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {results.map((tor) => (
                <TORCard key={tor.id} tor={tor} />
              ))}
            </div>
          )}

          {!loading && !error && totalCount > matched.length && (
            <p className="mt-6 text-xs text-[var(--color-text-muted)]">
              แสดง {matched.length} จาก {totalCount} รายการที่ตรงเงื่อนไข ลองเพิ่มตัวกรองเพื่อจำกัดผลลัพธ์
            </p>
          )}

          <p className="mt-6 text-xs text-[var(--color-text-muted)]">
            งบประมาณรวมของผลการค้นหา:{" "}
            <span className="font-medium text-[var(--color-text)]">
              {formatBudget(results.reduce((sum, t) => sum + t.budget, 0))}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
