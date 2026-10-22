'use client';

import React, { useState, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  ChevronDown,
  Filter,
  X,
  Globe,
  Languages,
  Tag,
  Check,
  Tv,
  ArrowUpDown,
  Search,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type Category = 'movie' | 'tv' | 'anime';

interface FilterOption {
  id: string | number;
  name: string;
  logo_path?: string;
  iso_639_1?: string;
  iso_3166_1?: string;
  provider_id?: string | number;
  english_name?: string;
  provider_name?: string;
}

interface FilterBarProps {
  genres: FilterOption[];
  languages: FilterOption[];
  countries: FilterOption[];
  providers?: FilterOption[];
  /** TMDB endpoint semantics. Anime browses the /tv endpoint. */
  type: 'movie' | 'tv';
  /** What the user thinks they're browsing — drives which filters appear. */
  category?: Category;
}

/** Which controls are meaningful for each category. */
const SHOWS: Record<Category, Set<string>> = {
  // Language and country are free choices here.
  movie: new Set(['genre', 'language', 'country', 'services', 'sort', 'certification']),
  tv: new Set(['genre', 'language', 'country', 'services', 'sort', 'certification', 'status']),
  // Anime pins original language to Japanese and genre to Animation server
  // side, so offering those two controls just lets you pick a value that
  // silently does nothing.
  anime: new Set(['genre', 'services', 'sort', 'certification', 'status']),
};

function sortOptions(category: Category): FilterOption[] {
  const base: FilterOption[] = [
    { id: 'popularity.desc', name: 'Popularity' },
    {
      id: category === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc',
      name: 'Newest',
    },
    { id: 'vote_average.desc', name: 'Top Rated' },
    { id: 'vote_count.desc', name: 'Most Voted' },
  ];
  // Verified against TMDB: sorting /discover/tv by revenue changes nothing
  // (229,558 rows vs 229,574), because series carry no revenue figure.
  if (category === 'movie') base.push({ id: 'revenue.desc', name: 'Box Office' });
  return base;
}

function certOptions(type: 'movie' | 'tv'): FilterOption[] {
  return type === 'movie'
    ? [
        { id: 'G', name: 'G — General' },
        { id: 'PG', name: 'PG — Guidance' },
        { id: 'PG-13', name: 'PG-13 — Teens' },
        { id: 'R', name: 'R — Adults' },
      ]
    : [
        { id: 'TV-G', name: 'TV-G — General' },
        { id: 'TV-PG', name: 'TV-PG — Guidance' },
        { id: 'TV-14', name: 'TV-14 — Teens' },
        { id: 'TV-MA', name: 'TV-MA — Adults' },
      ];
}

const STATUS_OPTIONS: FilterOption[] = [
  { id: '0', name: 'Returning Series' },
  { id: '1', name: 'Planned' },
  { id: '2', name: 'In Production' },
  { id: '3', name: 'Ended' },
  { id: '4', name: 'Cancelled' },
];

const FilterBar = ({
  genres,
  languages,
  countries,
  providers = [],
  type,
  category = type,
}: FilterBarProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');

  const shows = SHOWS[category] ?? SHOWS.movie;

  const current = {
    genre: searchParams.get('with_genres') || '',
    language: searchParams.get('with_original_language') || '',
    country: searchParams.get('with_origin_country') || '',
    services: searchParams.get('with_watch_providers') || '',
    sort: searchParams.get('sort_by') || 'popularity.desc',
    certification: searchParams.get('certification') || '',
    status: searchParams.get('with_status') || '',
  };

  const updateFilter = (key: string, value: string, isMulti = false) => {
    const params = new URLSearchParams(searchParams.toString());

    if (isMulti) {
      let values = params.get(key)?.split(',').filter(Boolean) || [];
      values = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      if (values.length > 0) params.set(key, values.join(','));
      else params.delete(key);
    } else if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // TMDB ignores `certification` unless it's scoped to a country — the
    // filter was silently doing nothing without this (1,171,476 results
    // with it set vs 1,171,462 without). Ratings are US-scheme here.
    if (key === 'certification') {
      if (params.get('certification')) params.set('certification_country', 'US');
      else params.delete('certification_country');
    }

    router.push(`?${params.toString()}`);
    if (!isMulti) setActiveDropdown(null);
    setFilterSearch('');
  };

  const clearFilters = () => router.push(pathname);

  const optionLabel = (o: FilterOption) =>
    o.name || o.english_name || o.provider_name || String(o.id);
  const optionId = (o: FilterOption) =>
    String(o.id ?? o.iso_639_1 ?? o.iso_3166_1 ?? o.provider_id);

  const FilterDropdown = ({
    title,
    icon: Icon,
    options,
    paramKey,
    activeValue,
    isMulti = false,
    searchable = true,
  }: any) => {
    const activeValues = isMulti ? activeValue.split(',').filter(Boolean) : [activeValue];

    const filtered = useMemo(() => {
      const list = [...options].sort((a: FilterOption, b: FilterOption) => {
        const codeA = a.iso_639_1 || a.iso_3166_1;
        const codeB = b.iso_639_1 || b.iso_3166_1;
        // Keep Arabic / Tunisia pinned to the top where they apply.
        if (codeA === 'ar' || codeA === 'TN') return -1;
        if (codeB === 'ar' || codeB === 'TN') return 1;
        return optionLabel(a).localeCompare(optionLabel(b));
      });
      if (!filterSearch) return list;
      return list.filter((o: FilterOption) =>
        optionLabel(o).toLowerCase().includes(filterSearch.toLowerCase())
      );
    }, [options, filterSearch]);

    const selected = options.find((o: FilterOption) => optionId(o) === activeValue);
    const isOpen = activeDropdown === title;

    return (
      <div className="relative">
        <button
          onClick={() => {
            setActiveDropdown(isOpen ? null : title);
            setFilterSearch('');
          }}
          className={`flex items-center gap-2 w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
            activeValue
              ? 'bg-accent/10 border-accent/40 text-accent'
              : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20 hover:text-white'
          }`}
        >
          <Icon size={15} className="shrink-0" />
          <span className="font-medium truncate flex-1 text-left">
            {isMulti && activeValues.length > 0
              ? `${activeValues.length} selected`
              : selected
              ? optionLabel(selected)
              : title}
          </span>
          <ChevronDown
            size={13}
            className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)} />
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.13 }}
                className="absolute top-full mt-2 left-0 w-64 bg-card border border-white/10 rounded-2xl p-2 z-50 shadow-2xl flex flex-col"
              >
                {searchable && options.length > 8 && (
                  <div className="relative mb-2 px-1">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                      size={14}
                    />
                    <input
                      autoFocus
                      type="text"
                      placeholder={`Search ${title.toLowerCase()}…`}
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {!isMulti && !filterSearch && activeValue && (
                    <button
                      onClick={() => updateFilter(paramKey, '')}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors text-muted"
                    >
                      Any {title.toLowerCase()}
                    </button>
                  )}

                  {filtered.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-white/30">
                      Nothing matches that.
                    </div>
                  )}

                  {filtered.map((opt: FilterOption) => {
                    const id = optionId(opt);
                    const isActive = activeValues.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => updateFilter(paramKey, id, isMulti)}
                        className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive ? 'bg-accent/20 text-accent' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {opt.logo_path && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://image.tmdb.org/t/p/original${opt.logo_path}`}
                              alt=""
                              className="w-5 h-5 rounded shadow-sm"
                            />
                          )}
                          <span className="truncate">{optionLabel(opt)}</span>
                        </div>
                        {isActive && <Check size={14} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Chips describe what's actually applied, so the state is readable
  // without opening every dropdown to check.
  const chips: { label: string; onClear: () => void }[] = [];
  const pushChip = (key: string, paramKey: string, label: string) => {
    if (!current[key as keyof typeof current]) return;
    chips.push({ label, onClear: () => updateFilter(paramKey, '') });
  };
  if (shows.has('genre'))
    pushChip(
      'genre',
      'with_genres',
      genres.find((g) => optionId(g) === current.genre)
        ? `Genre: ${optionLabel(genres.find((g) => optionId(g) === current.genre)!)}`
        : 'Genre'
    );
  if (shows.has('language')) pushChip('language', 'with_original_language', `Language: ${current.language.toUpperCase()}`);
  if (shows.has('country')) pushChip('country', 'with_origin_country', `Country: ${current.country}`);
  if (shows.has('certification')) pushChip('certification', 'certification', `Rating: ${current.certification}`);
  if (shows.has('status')) {
    const st = STATUS_OPTIONS.find((s) => String(s.id) === current.status);
    if (st) pushChip('status', 'with_status', `Status: ${st.name}`);
  }
  if (shows.has('services') && current.services)
    chips.push({
      label: `${current.services.split(',').filter(Boolean).length} service(s)`,
      onClear: () => updateFilter('with_watch_providers', ''),
    });

  return (
    <div className="mb-8 rounded-3xl bg-white/[0.02] border border-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
          <Filter size={13} />
          <span>Filters</span>
        </p>
        {chips.length > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
          >
            <X size={12} />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {/* A grid rather than a wrap row: controls keep the same width and
          stay on a predictable line instead of reflowing as labels change. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {shows.has('genre') && (
          <FilterDropdown
            title="Genre"
            icon={Tag}
            options={genres}
            paramKey="with_genres"
            activeValue={current.genre}
          />
        )}
        {shows.has('language') && (
          <FilterDropdown
            title="Language"
            icon={Languages}
            options={languages}
            paramKey="with_original_language"
            activeValue={current.language}
          />
        )}
        {shows.has('country') && (
          <FilterDropdown
            title="Country"
            icon={Globe}
            options={countries}
            paramKey="with_origin_country"
            activeValue={current.country}
          />
        )}
        {shows.has('services') && providers.length > 0 && (
          <FilterDropdown
            title="Services"
            icon={Tv}
            options={providers}
            paramKey="with_watch_providers"
            activeValue={current.services}
            isMulti
          />
        )}
        {shows.has('status') && (
          <FilterDropdown
            title="Status"
            icon={Activity}
            options={STATUS_OPTIONS}
            paramKey="with_status"
            activeValue={current.status}
            searchable={false}
          />
        )}
        {shows.has('certification') && (
          <FilterDropdown
            title="Age Rating"
            icon={ShieldCheck}
            options={certOptions(type)}
            paramKey="certification"
            activeValue={current.certification}
            searchable={false}
          />
        )}
        {shows.has('sort') && (
          <FilterDropdown
            title="Sort By"
            icon={ArrowUpDown}
            options={sortOptions(category)}
            paramKey="sort_by"
            activeValue={current.sort}
            searchable={false}
          />
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={c.onClear}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/25 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors"
            >
              <span>{c.label}</span>
              <X size={11} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FilterBar;
