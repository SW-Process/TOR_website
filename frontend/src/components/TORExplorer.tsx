"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import TORCard from "./TORCard";
import {
  agencies,
  categories,
  Category,
  daysUntil,
  formatBudget,
  torList,
  TORStatus,
} from "@/lib/mockData";

type SortKey = "newest" | "deadline" | "budgetDesc" | "budgetAsc";

const statuses: TORStatus[] = ["เปิดรับ", "ใกล้ปิดรับ", "ปิดรับแล้ว"];

export default function TORExplorer({
  initialQuery = "",
  initialCategory = "",
  initialSort = "newest",
}: {
  initialQuery?: string;
  initialCategory?: string;
  initialSort?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>(
    initialCategory && categories.includes(initialCategory as Category)
      ? [initialCategory as Category]
      : []
  );
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<TORStatus[]>([]);
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [sort, setSort] = useState<SortKey>(
    initialSort === "deadline" ? "deadline" : "newest"
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  function toggle<T>(list: T[], value: T, setter: (v: T[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const results = useMemo(() => {
    let list = torList.filter((tor) => {
      const matchesQuery =
        !query.trim() ||
        tor.title.toLowerCase().includes(query.toLowerCase()) ||
        tor.agency.toLowerCase().includes(query.toLowerCase()) ||
        tor.projectCode.toLowerCase().includes(query.toLowerCase());

      const matchesCategory =
        selectedCategories.length === 0 || selectedCategories.includes(tor.category);

      const matchesAgency =
        selectedAgencies.length === 0 || selectedAgencies.includes(tor.agency);

      const matchesStatus =
        selectedStatuses.length === 0 || selectedStatuses.includes(tor.status);

      const matchesMin = !minBudget || tor.budget >= Number(minBudget);
      const matchesMax = !maxBudget || tor.budget <= Number(maxBudget);

      return (
        matchesQuery &&
        matchesCategory &&
        matchesAgency &&
        matchesStatus &&
        matchesMin &&
        matchesMax
      );
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
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

    return list;
  }, [query, selectedCategories, selectedAgencies, selectedStatuses, minBudget, maxBudget, sort]);

  const activeFilterCount =
    selectedCategories.length +
    selectedAgencies.length +
    selectedStatuses.length +
    (minBudget ? 1 : 0) +
    (maxBudget ? 1 : 0);

  function clearFilters() {
    setSelectedCategories([]);
    setSelectedAgencies([]);
    setSelectedStatuses([]);
    setMinBudget("");
    setMaxBudget("");
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
          {statuses.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={selectedStatuses.includes(s)}
                onChange={() => toggle(selectedStatuses, s, setSelectedStatuses)}
                className="rounded border-[var(--color-border)] accent-[var(--color-rose-dark)]"
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">หมวดหมู่</p>
        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
          {categories.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={selectedCategories.includes(c)}
                onChange={() => toggle(selectedCategories, c, setSelectedCategories)}
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
                checked={selectedAgencies.includes(a)}
                onChange={() => toggle(selectedAgencies, a, setSelectedAgencies)}
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
            value={minBudget}
            onChange={(e) => setMinBudget(e.target.value)}
            className="w-full rounded-full border border-[var(--color-border)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
          />
          <span className="text-[var(--color-text-muted)]">–</span>
          <input
            type="number"
            placeholder="สูงสุด"
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            className="w-full rounded-full border border-[var(--color-border)] px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
          />
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
          พบทั้งหมด {torList.length} โครงการ จากหน่วยงานในสังกัดกรุงเทพมหานคร
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-5 py-1 shadow-[var(--shadow-sm)]">
        <Search size={18} className="text-[var(--color-text-faint)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
            >
              <option value="newest">ประกาศล่าสุด</option>
              <option value="deadline">ใกล้ปิดรับก่อน</option>
              <option value="budgetDesc">งบประมาณ: มาก-น้อย</option>
              <option value="budgetAsc">งบประมาณ: น้อย-มาก</option>
            </select>
          </div>

          {results.length === 0 ? (
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
