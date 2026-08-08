import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Mic, X, Sparkles } from "lucide-react";
import { api, type AiProduct, type MenuOverride, type PublicSettings } from "@/lib/api";
import { buildLiveMenu, searchMenu, SUGGESTED_QUERIES, type LiveItem } from "@/lib/menu-search";
import { MenuItemCard } from "@/components/MenuItemCard";
import { Button } from "@/components/ui/button";
import { useT, i18n } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { cartStore } from "@/lib/cart-store";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechCtor = new () => SpeechRec;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] as SpeechCtor) || (w["webkitSpeechRecognition"] as SpeechCtor) || null;
}

type Answer = {
  text: string;
  products: AiProduct[];
  suggestions: string[];
  source: "local" | "ai";
};

export function SmartSearch({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useT();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<MenuOverride[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  // Resolved after mount only — keeps SSR and first client render identical.
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    setVoiceSupported(Boolean(speechCtor()));
    api.getMenuOverrides().then((r) => setOverrides(r.overrides)).catch(() => {});
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  const live = useMemo(() => buildLiveMenu(overrides, settings), [overrides, settings]);
  const byId = useMemo(() => new Map(live.map((i) => [i.id, i])), [live]);

  const localAnswer = useCallback(
    (value: string): Answer => {
      const hits = searchMenu(value, live, 8);
      return {
        text: hits.length ? t("search.results") : t("search.noResults"),
        products: hits.map((h) => ({
          id: h.id,
          name: h.name,
          price: h.price,
          image: h.image,
          reason: h.reason,
          available: h.available,
          categoryName: h.categoryName,
        })),
        suggestions: SUGGESTED_QUERIES[lang] ?? SUGGESTED_QUERIES.fr,
        source: "local",
      };
    },
    [live, lang, t],
  );

  const run = useCallback(
    async (q: string, source: "search" | "voice_search" = "search") => {
      const value = q.trim();
      if (!value) return;
      setBusy(true);
      // Instant local answer first — the assistant never blocks on the network.
      const local = localAnswer(value);
      setAnswer(local);
      analytics.track(source === "voice_search" ? "voice_search" : "search", {
        query: value,
        results: local.products.length,
      });
      try {
        const res = await api.aiMenuSearch({
          query: value,
          language: lang,
          sessionContext: { cartItemIds: cartStore.getSnapshot().map((c) => c.itemId) },
        });
        // Only trust server products that exist in the live menu we know about.
        const products = res.products.filter((p) => byId.size === 0 || byId.has(p.id));
        setAnswer({
          text: res.answer || local.text,
          products: products.length ? products : local.products,
          suggestions: res.suggestedQueries?.length ? res.suggestedQueries : local.suggestions,
          source: res.meta?.source === "ai" ? "ai" : "local",
        });
      } catch {
        // Offline / no Express backend (preview) — local results stand.
      } finally {
        setBusy(false);
      }
    },
    [byId, lang, localAnswer],
  );

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
        void run(transcript, "voice_search");
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

  const suggestions = answer?.suggestions ?? SUGGESTED_QUERIES[lang] ?? SUGGESTED_QUERIES.fr;

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
          void run(query);
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
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setAnswer(null);
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
        <Button type="submit" className="h-11 shrink-0" disabled={busy}>
          {t("search.button")}
        </Button>
      </form>

      <div aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground">
        {busy ? t("search.thinking") : listening ? t("search.listening") : heard ? `${t("search.heard")} « ${heard} »` : t("search.hint")}
      </div>

      {!answer && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                void run(s);
              }}
              className="min-h-11 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {answer && (
        <div className="mt-5 rounded-2xl border border-border bg-card/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl leading-tight">{answer.text}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("search.assistantNote")}</p>
            </div>
            <button
              type="button"
              onClick={() => setAnswer(null)}
              aria-label={t("search.close")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {answer.products.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {answer.products.map((p) => {
                const item: LiveItem | undefined = byId.get(p.id);
                if (!item) return null;
                return (
                  <div key={p.id}>
                    <MenuItemCard
                      item={item.item}
                      override={{ available: p.available, priceOverride: p.price, imageOverride: p.image }}
                    />
                    {p.reason && <p className="mt-1 px-1 text-xs text-muted-foreground">{p.reason}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {suggestions.length > 0 && (
            <>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("search.followUp")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setQuery(s);
                      void run(s);
                    }}
                    className="min-h-11 rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
