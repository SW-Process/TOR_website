"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { categories } from "@/lib/mockData";

export default function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    router.push(`/tor${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-2 rounded-full border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-lg)] sm:pl-6"
    >
      <div className="flex flex-1 items-center gap-2 px-2 sm:px-0">
        <Search size={18} className="text-[var(--color-text-faint)] shrink-0 sm:hidden" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="text"
          placeholder="ค้นหาชื่อโครงการ, หน่วยงาน หรือคำสำคัญ"
          className="w-full py-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
        />
      </div>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="rounded-full border border-[var(--color-border)] bg-[var(--color-blush-soft)] px-4 py-3 text-sm text-[var(--color-text)] sm:max-w-[180px] focus:outline-none"
      >
        <option value="">ทุกหมวดหมู่</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-pill btn-pill-primary shadow-[var(--shadow-glow)] px-6 py-3 text-sm">
        <Search size={16} />
        ค้นหา TOR
      </button>
    </form>
  );
}
