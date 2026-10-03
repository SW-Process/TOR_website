"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import TORCard from "./TORCard";
import { categories, formatBudget } from "@/lib/mockData";
import {
  CLOSING_SOON_DAYS,
  fetchAgencies,
  fetchTechnologies,
  searchTors,
  type AgencyOptions,
  type TechOption,
  type TorSearchResult,
} from "@/lib/torApi";
import {
  activeFilterCount as countActive,
  dedupeCaseInsensitive,
  isBudgetRangeInverted,
  isDateRangeInverted,
  MAX_TECH_FILTERS,
  PAGE_SIZE,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  STATUSES,
  toApiParams,
  toUrlParams,
  type SortKey,
  type TorFilters,
} from "@/lib/torSearch";

const EMPTY_FILTERS: Omit<TorFilters, "q" | "sort" | "page"> = {
  categories: [],
  agencies: [],
  tech: [],
  projectTypes: [],
  statuses: [],
  budgetMin: "",
  budgetMax: "",
  publishedFrom: "",
  publishedTo: "",
  deadlineFrom: "",
  deadlineTo: "",
};

/** A from/to pair of `YYYY-MM-DD` inputs (FR-4); flags an inverted range. */
function DateRangeFilter({
  label,
  from,
  to,
  onChange,
  note,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  note?: string;
}) {
  const inverted = isDateRangeInverted(from, to);
  const inputClass = `w-full rounded-full border px-3.5 py-2 text-sm focus:outline-none ${
    inverted ? "border-[var(--color-danger)]" : "border-[var(--color-border)] focus:border-[var(--color-ink)]"
  }`;
  return (
    <div>
      <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">{label}</p>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span className="w-8 shrink-0">ตั้งแต่</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            aria-invalid={inverted}
            onChange={(e) => onChange(e.target.value, to)}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span className="w-8 shrink-0">ถึง</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            aria-invalid={inverted}
            onChange={(e) => onChange(from, e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {inverted ? (
        <p role="alert" className="mt-1.5 text-xs text-[var(--color-danger)]">
          วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด — ยังไม่ได้กรองตามช่วงวันนี้
        </p>
      ) : (
        note && (from || to) && <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{note}</p>
      )}
    </div>
  );
}

/** How many of the most-used tech values to offer as one-click chips. */
const TECH_QUICK_PICKS = 8;

/** Wait this long after the last keystroke before re-querying the backend. */
const SEARCH_DEBOUNCE_MS = 300;

export default function TORExplorer({ initialFilters }: { initialFilters: TorFilters }) {
  const [filters, setFiltersState] = useState<TorFilters>(initialFilters);
  // Any filter or sort change starts again from page 1; only goToPage keeps it.
  const setFilters = (next: (f: TorFilters) => TorFilters) =>
    setFiltersState((f) => ({ ...next(f), page: 1 }));
  const update = (patch: Partial<TorFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const resultsTop = useRef<HTMLDivElement>(null);
  function goToPage(page: number) {
    setFiltersState((f) => ({ ...f, page }));
    resultsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Options come from the whole collection, not the current results, so picking
  // one agency doesn't make the others disappear from the panel.
  const [agencyOptions, setAgencyOptions] = useState<AgencyOptions>({ agencies: [], totalCount: 0 });
  useEffect(() => {
    fetchAgencies().then(setAgencyOptions);
  }, []);

  // Keep agencies selected via the URL visible even if they have no TORs (yet).
  const agencies = useMemo(
    () =>
      [...new Set([...agencyOptions.agencies, ...filters.agencies])].sort((a, b) =>
        a.localeCompare(b, "th")
      ),
    [agencyOptions.agencies, filters.agencies]
  );

  // Tech stack is free text with hundreds of values, so it's a type-ahead with
  // the most used values as one-click chips rather than a checkbox list.
  const [techOptions, setTechOptions] = useState<TechOption[]>([]);
  useEffect(() => {
    fetchTechnologies().then(setTechOptions);
  }, []);
  const [techDraft, setTechDraft] = useState("");
  const selectedTech = new Set(filters.tech.map((t) => t.toLowerCase()));
  const techSuggestions = techOptions.filter((o) => !selectedTech.has(o.name.toLowerCase()));

  function addTech(value: string) {
    const v = value.trim();
    if (!v) return;
    setFilters((f) => ({ ...f, tech: dedupeCaseInsensitive([...f.tech, v]).slice(0, MAX_TECH_FILTERS) }));
    setTechDraft("");
  }

  function removeTech(value: string) {
    setFilters((f) => ({ ...f, tech: f.tech.filter((t) => t !== value) }));
  }

  // Keep the URL in sync without a navigation/re-render, so refresh, share and
  // back restore the same search.
  const urlQuery = toUrlParams(filters).toString();
  useEffect(() => {
    const next = urlQuery ? `?${urlQuery}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [urlQuery]);

  // One backend query: every filter + sort + page (FR-2, FR-7).
  const apiQuery = toApiParams(filters).toString();
  const [result, setResult] = useState<TorSearchResult>({
    tors: [],
    page: 1,
    totalCount: 0,
    totalBudget: 0,
    hasNextPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchTors(new URLSearchParams(apiQuery), controller.signal)
        .then((r) => {
          setResult(r);
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

  function toggle<K extends "categories" | "agencies" | "projectTypes" | "statuses">(key: K, value: TorFilters[K][number]) {
    setFilters((f) => {
      const list = f[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...f, [key]: next };
    });
  }

  const results = result.tors;
  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));

  const activeFilterCount = countActive(filters);
  const budgetInverted = isBudgetRangeInverted(filters);
  const budgetInputClass = `w-full rounded-full border px-3.5 py-2 text-sm focus:outline-none ${
    budgetInverted
      ? "border-[var(--color-danger)]"
      : "border-[var(--color-border)] focus:border-[var(--color-ink)]"
  }`;

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
              {s === "ใกล้ปิดรับ" && (
                <span className="text-xs text-[var(--color-text-faint)]">(ภายใน {CLOSING_SOON_DAYS} วัน)</span>
              )}
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
        <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">ประเภทโครงการ</p>
        <div className="flex flex-col gap-2">
          {PROJECT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={filters.projectTypes.includes(t)}
                onChange={() => toggle("projectTypes", t)}
                className="rounded border-[var(--color-border)] accent-[var(--color-rose-dark)]"
              />
              {PROJECT_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">เทคโนโลยี</p>
        {filters.tech.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {filters.tech.map((t) => (
              <span
                key={t}
                className="badge inline-flex items-center gap-1 bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]"
              >
                {t}
                <button onClick={() => removeTech(t)} aria-label={`ลบ ${t}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTech(techDraft);
          }}
          className="flex items-center gap-2"
        >
          <input
            list="tech-options"
            value={techDraft}
            onChange={(e) => setTechDraft(e.target.value)}
            placeholder="เช่น Linux, Oracle Database"
            disabled={filters.tech.length >= MAX_TECH_FILTERS}
            className="w-full rounded-full border border-[var(--color-border)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
          />
          <button
            type="submit"
            aria-label="เพิ่มเทคโนโลยี"
            disabled={!techDraft.trim()}
            className="shrink-0 rounded-full border border-[var(--color-border)] p-2 text-[var(--color-text)] disabled:opacity-40"
          >
            <Plus size={14} />
          </button>
          <datalist id="tech-options">
            {techSuggestions.map((o) => (
              <option key={o.name} value={o.name} />
            ))}
          </datalist>
        </form>
        {techSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {techSuggestions.slice(0, TECH_QUICK_PICKS).map((o) => (
              <button
                key={o.name}
                onClick={() => addTech(o.name)}
                className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-ink)] hover:text-[var(--color-text)]"
              >
                {o.name}
              </button>
            ))}
          </div>
        )}
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
            aria-label="งบประมาณต่ำสุด (บาท)"
            aria-invalid={budgetInverted}
            min={0}
            value={filters.budgetMin}
            onChange={(e) => update({ budgetMin: e.target.value.replace(/\D/g, "") })}
            className={budgetInputClass}
          />
          <span className="text-[var(--color-text-muted)]">–</span>
          <input
            type="number"
            placeholder="สูงสุด"
            aria-label="งบประมาณสูงสุด (บาท)"
            aria-invalid={budgetInverted}
            min={0}
            value={filters.budgetMax}
            onChange={(e) => update({ budgetMax: e.target.value.replace(/\D/g, "") })}
            className={budgetInputClass}
          />
        </div>
        {budgetInverted ? (
          <p role="alert" className="mt-1.5 text-xs text-[var(--color-danger)]">
            งบต่ำสุดต้องไม่เกินงบสูงสุด — ยังไม่ได้กรองตามงบประมาณ
          </p>
        ) : (
          (filters.budgetMin || filters.budgetMax) && (
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              {filters.budgetMin ? formatBudget(Number(filters.budgetMin)) : "ไม่จำกัด"} –{" "}
              {filters.budgetMax ? formatBudget(Number(filters.budgetMax)) : "ไม่จำกัด"}
            </p>
          )
        )}
      </div>

      <DateRangeFilter
        label="วันที่ประกาศ"
        from={filters.publishedFrom}
        to={filters.publishedTo}
        onChange={(publishedFrom, publishedTo) => update({ publishedFrom, publishedTo })}
      />

      <DateRangeFilter
        label="วันปิดรับข้อเสนอ"
        from={filters.deadlineFrom}
        to={filters.deadlineTo}
        onChange={(deadlineFrom, deadlineTo) => update({ deadlineFrom, deadlineTo })}
        note="TOR ที่ไม่ระบุวันปิดรับจะไม่แสดงเมื่อใช้ตัวกรองนี้"
      />
    </div>
  );

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
          ค้นหาประกาศจัดซื้อจัดจ้าง (TOR)
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
          พบทั้งหมด {agencyOptions.totalCount} โครงการ จากหน่วยงานในสังกัดกรุงเทพมหานคร
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-5 py-1 shadow-[var(--shadow-sm)]">
        <Search size={18} className="text-[var(--color-text-faint)]" />
        <input
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="ค้นหาชื่อโครงการ, หน่วยงาน, เลขที่โครงการ หรือคำสำคัญ"
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
          <div ref={resultsTop} className="flex items-center justify-between mb-4 scroll-mt-24">
            <p className="text-sm text-[var(--color-text-muted)]">
              พบ <span className="font-semibold text-[var(--color-text)]">{result.totalCount}</span> รายการ
              {result.totalCount > PAGE_SIZE && (
                <>
                  {" "}
                  · หน้า {filters.page} จาก {totalPages}
                </>
              )}
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
          ) : results.length === 0 && filters.page > 1 ? (
            <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">
              ไม่มีผลลัพธ์ในหน้า {filters.page}
              <button
                onClick={() => goToPage(1)}
                className="block mx-auto mt-3 text-[var(--color-rose-dark)] font-semibold hover:underline"
              >
                กลับไปหน้าแรก
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">
              {filters.q.trim()
                ? `ไม่พบ TOR ที่ตรงกับ “${filters.q.trim()}”`
                : "ไม่พบ TOR ที่ตรงกับเงื่อนไขการค้นหา"}{" "}
              ลองปรับตัวกรองหรือคำค้นหาใหม่
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

          {!loading && !error && totalPages > 1 && (
            <nav aria-label="เปลี่ยนหน้าผลการค้นหา" className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => goToPage(filters.page - 1)}
                disabled={filters.page <= 1}
                className="btn-pill border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] disabled:opacity-40"
              >
                <ChevronLeft size={15} />
                ก่อนหน้า
              </button>
              <span className="text-sm text-[var(--color-text-muted)]">
                หน้า {filters.page} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(filters.page + 1)}
                disabled={!result.hasNextPage}
                className="btn-pill border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] disabled:opacity-40"
              >
                ถัดไป
                <ChevronRight size={15} />
              </button>
            </nav>
          )}

          <p className="mt-6 text-xs text-[var(--color-text-muted)]">
            งบประมาณรวมของผลการค้นหา:{" "}
            <span className="font-medium text-[var(--color-text)]">{formatBudget(result.totalBudget)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
