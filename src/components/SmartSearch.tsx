import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Mic, X, Sparkles } from "lucide-react";
import { api, type MenuOverride, type PublicSettings } from "@/lib/api";
import { buildLiveMenu, searchMenu, SUGGESTED_QUERIES, type SearchHit } from "@/lib/menu-search";
import { MenuItemCard } from "@/components/MenuItemCard";
import { Button } from "@/components/ui/button";
import { useT, i18n } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] as SpeechCtor) || (w["webkitSpeechRecognition"] as SpeechCtor) || null;
}

export function SmartSearch({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<MenuOverride[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const recRef = useRef<ReturnType<SpeechCtor> | null>(null);
  const voiceSupported = useMemo(() => Boolean(speechCtor()), []);

  useEffect(() => {
    api.getMenuOverrides().then((r) => setOverrides(r.overrides)).catch(() => {});
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  const live = useMemo(() => buildLiveMenu(overrides, settings), [overrides, settings]);

  const run = (q: string, source: "search" | "voice_search" = "search") => {
    const value = q.trim();
    if (!value) return;
    const hits = searchMenu(value, live, 8);
    setResults(hits);
    analytics.track(source === "voice_search" ? "voice_search" : "search", { query: value, results: hits.length });
  };

  const startVoice = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = i18n.speechLocale(lang);
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setQuery(transcript);
        setHeard(transcript);
        run(transcript, "voice_search");
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setHeard(null);
    setListening(true);
    rec.start();
  };

  const stopVoice = () => {
    recRef.current?.stop();
    setListening(false);
  };

  const suggestions = SUGGESTED_QUERIES[lang] ?? SUGGESTED_QUERIES.fr;

  return (
    <section className="w-full" aria-label={t("search.title")}>
      {!compact && (
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t("search.title")}</span>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm"
        role="search"
      >
        <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <label className="sr-only" htmlFor="smart-search-input">
          {t("search.placeholder")}
        </label>
        <input
          id="smart-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          inputMode="search"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults(null);
              setHeard(null);
            }}
            aria-label={t("search.clear")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {voiceSupported && (
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            aria-label={t("search.voice")}
            aria-pressed={listening}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition ${
              listening ? "animate-pulse border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"
            }`}
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
        <Button type="submit" className="h-11 shrink-0">
          {t("search.button")}
        </Button>
      </form>

      <div aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground">
        {listening ? t("search.listening") : heard ? `${t("search.heard")} « ${heard} »` : t("search.hint")}
      </div>

      {!results && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                run(s);
              }}
              className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {results && (
        <div className="mt-5">
          <h2 className="font-display text-xl">{results.length ? t("search.results") : t("search.noResults")}</h2>
          {results.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((h) => (
                <div key={h.id}>
                  <MenuItemCard
                    item={h.item}
                    override={{ available: h.available, priceOverride: h.price, imageOverride: h.image }}
                  />
                  {h.reason && <p className="mt-1 px-1 text-xs text-muted-foreground">{h.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
