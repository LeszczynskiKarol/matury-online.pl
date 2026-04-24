// ══════════════════════════════════════════════════════════════════════════
// AdminExport — Eksport pytań do CSV z dowolnymi zbiorami filtrów
// Plik: src/components/admin/AdminExport.tsx
//
// ZERO nowych endpointów — korzysta z istniejącego GET /admin/questions
// CSV generowany client-side, deduplikacja po ID
// ══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { admin } from "../../lib/api";

interface FilterGroup {
  id: string;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  type: string;
  difficulty: string;
  source: string;
  count: number | null;
  loading: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  CLOSED: "Zamknięte",
  MULTI_SELECT: "Wielokrotne",
  TRUE_FALSE: "P/F",
  OPEN: "Otwarte",
  FILL_IN: "Uzupełnij",
  MATCHING: "Dopasuj",
  ORDERING: "Kolejność",
  WIAZKA: "Wiązka",
  LISTENING: "Słuchanie",
  TABLE_DATA: "Tabela",
  GRAPH_INTERPRET: "Wykres",
  ERROR_FIND: "Błąd",
  CLOZE: "Luki",
  PROOF_ORDER: "Dowód",
  ESSAY: "Esej",
  DIAGRAM_LABEL: "Schemat",
  EXPERIMENT_DESIGN: "Doświadczenie",
  CROSS_PUNNETT: "Krzyżówka",
  CALCULATION: "Obliczenia",
};

const ALL_TYPES = Object.keys(TYPE_LABELS);

export function AdminExport() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [topicsBySubject, setTopicsBySubject] = useState<Record<string, any[]>>(
    {},
  );
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  const [draftSubject, setDraftSubject] = useState("");
  const [draftTopic, setDraftTopic] = useState("");
  const [draftType, setDraftType] = useState("");
  const [draftDifficulty, setDraftDifficulty] = useState("");
  const [draftSource, setDraftSource] = useState("");

  useEffect(() => {
    admin.subjects().then(setSubjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (!draftSubject || topicsBySubject[draftSubject]) return;
    admin
      .topics(draftSubject)
      .then((t) => setTopicsBySubject((p) => ({ ...p, [draftSubject]: t })));
  }, [draftSubject]);

  const currentTopics =
    topicsBySubject[draftSubject]?.filter((t: any) => t.depth === 0) || [];
  const currentSubject = subjects.find((s) => s.id === draftSubject);

  const buildParams = (g: FilterGroup) => {
    const p: Record<string, any> = { isActive: "true" };
    if (g.subjectId) p.subjectId = g.subjectId;
    if (g.topicId) p.topicId = g.topicId;
    if (g.type) p.type = g.type;
    if (g.difficulty) p.difficulty = g.difficulty;
    return p;
  };

  const addGroup = async () => {
    if (!draftSubject && !draftType && !draftDifficulty && !draftSource) return;

    const topicObj = currentTopics.find((t: any) => t.id === draftTopic);
    const newGroup: FilterGroup = {
      id: `g_${Date.now()}`,
      subjectId: draftSubject,
      subjectName: currentSubject?.name || "",
      topicId: draftTopic,
      topicName: topicObj?.name || "",
      type: draftType,
      difficulty: draftDifficulty,
      source: draftSource,
      count: null,
      loading: true,
    };

    setGroups((prev) => [...prev, newGroup]);
    setDraftSubject("");
    setDraftTopic("");
    setDraftType("");
    setDraftDifficulty("");
    setDraftSource("");

    try {
      const data = await admin.questions({
        ...buildParams(newGroup),
        limit: 1,
        offset: 0,
      });
      setGroups((prev) =>
        prev.map((g) =>
          g.id === newGroup.id
            ? { ...g, count: data.total, loading: false }
            : g,
        ),
      );
    } catch {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === newGroup.id ? { ...g, count: 0, loading: false } : g,
        ),
      );
    }
  };

  const removeGroup = (id: string) => {
    setGroups((p) => p.filter((g) => g.id !== id));
    setExportResult(null);
  };
  const clearAll = () => {
    setGroups([]);
    setExportResult(null);
  };

  const totalCount = groups.reduce((s, g) => s + (g.count || 0), 0);
  const allCounted = groups.every((g) => g.count !== null);

  const handleExport = async () => {
    if (groups.length === 0) return;
    setExporting(true);
    setExportResult(null);

    try {
      const allQ = new Map<string, any>();

      for (const g of groups) {
        const params = buildParams(g);
        let offset = 0;
        while (true) {
          const data = await admin.questions({ ...params, limit: 200, offset });
          for (const q of data.questions) {
            if (g.source && q.source !== g.source) continue;
            allQ.set(q.id, q);
          }
          if (data.questions.length < 200) break;
          offset += 200;
        }
      }

      const questions = [...allQ.values()];
      const esc = (v: any): string => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s}"`
          : s;
      };

      const headers = [
        "id",
        "przedmiot",
        "temat",
        "typ",
        "trudnosc",
        "punkty",
        "zrodlo",
        "tresc",
        "odpowiedz",
        "objasnienie",
        "proby",
        "poprawne",
        "data",
        "content_json",
      ];
      const rows = questions.map((q) => {
        const c = q.content || {};
        const text = c.question || c.context || c.prompt || c.instruction || "";
        let ans = "";
        if (c.correctAnswer) ans = String(c.correctAnswer);
        else if (c.correctAnswers) ans = c.correctAnswers.join(", ");
        else if (c.sampleAnswer) ans = c.sampleAnswer;
        else if (c.statements)
          ans = c.statements
            .map((s: any) => `${s.text}: ${s.isTrue ? "T" : "F"}`)
            .join("; ");
        else if (c.pairs)
          ans = c.pairs.map((p: any) => `${p.left} → ${p.right}`).join("; ");
        else if (Array.isArray(c.blanks))
          ans = c.blanks
            .map((b: any) => b.acceptedAnswers?.[0] || "")
            .join("; ");

        return [
          q.id,
          q.subject?.name || "",
          q.topic?.name || "",
          q.type,
          q.difficulty,
          q.points,
          q.source || "",
          text,
          ans,
          q.explanation || "",
          q.totalAttempts,
          q.correctCount,
          q.createdAt ? new Date(q.createdAt).toISOString() : "",
          JSON.stringify(c),
        ]
          .map(esc)
          .join(",");
      });

      const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `matury-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);

      setExportResult(
        `Wyeksportowano ${questions.length} pytań (zdeduplikowane)`,
      );
    } catch (err) {
      console.error(err);
      setExportResult("Błąd eksportu");
    } finally {
      setExporting(false);
    }
  };

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-lg">
            Eksport pytań do CSV
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Łącz dowolne filtry: przedmiot + temat + typ + trudność + źródło →
            eksportuj jednym kliknięciem.
          </p>
        </div>
        <div className="flex gap-2">
          {groups.length > 0 && (
            <button onClick={clearAll} className="btn-ghost text-xs">
              Wyczyść
            </button>
          )}
          {groups.length > 0 && (
            <button
              onClick={handleExport}
              disabled={exporting || !allCounted || totalCount === 0}
              className="btn-primary text-sm py-2.5 px-6 disabled:opacity-40"
            >
              {exporting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Pobieram...
                </span>
              ) : (
                `📥 Eksportuj ~${totalCount} pytań`
              )}
            </button>
          )}
        </div>
      </div>

      {exportResult && (
        <div className="p-3 rounded-xl bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30 text-sm text-brand-700 dark:text-brand-400">
          ✓ {exportResult}
        </div>
      )}

      {/* ═══ LISTA ZBIORÓW ═══ */}
      {groups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Zbiory ({groups.length})
          </h3>
          {groups.map((g, i) => (
            <div
              key={g.id}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-surface-800 border border-zinc-200 dark:border-zinc-700"
            >
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                {g.subjectName && <Badge color="indigo">{g.subjectName}</Badge>}
                {g.topicName && <Badge color="sky">{g.topicName}</Badge>}
                {g.type && (
                  <Badge color="emerald">{TYPE_LABELS[g.type] || g.type}</Badge>
                )}
                {g.difficulty && (
                  <Badge color="amber">Poz.{g.difficulty}</Badge>
                )}
                {g.source && (
                  <Badge color="purple">
                    {g.source === "PP" ? "Podstawa" : "Rozszerzenie"}
                  </Badge>
                )}
                {!g.subjectName && !g.type && !g.difficulty && !g.source && (
                  <span className="text-[10px] text-zinc-400 italic">
                    Wszystkie
                  </span>
                )}
              </div>
              <span className="text-sm font-mono font-bold text-zinc-700 dark:text-zinc-300 flex-shrink-0 min-w-[70px] text-right">
                {g.loading ? (
                  <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  `${g.count} pyt.`
                )}
              </span>
              <button
                onClick={() => removeGroup(g.id)}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
            <span className="text-xs text-zinc-500">
              Suma (duplikaty usunięte):
            </span>
            <span className="font-display font-bold text-lg">
              {allCounted ? `~${totalCount}` : "..."} pytań
            </span>
          </div>
        </div>
      )}

      {/* ═══ FORMULARZ ═══ */}
      <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-surface-800 border border-zinc-200 dark:border-zinc-700 space-y-4">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
          + Dodaj zbiór filtrów
        </h3>

        {/* Przedmiot */}
        <FilterRow label="Przedmiot">
          <Pill
            active={!draftSubject}
            onClick={() => {
              setDraftSubject("");
              setDraftTopic("");
            }}
          >
            Dowolny
          </Pill>
          {subjects.map((s) => (
            <Pill
              key={s.id}
              active={draftSubject === s.id}
              onClick={() => {
                setDraftSubject(s.id);
                setDraftTopic("");
              }}
            >
              {s.icon} {s.name}{" "}
              <span className="opacity-50">{s._count?.questions || 0}</span>
            </Pill>
          ))}
        </FilterRow>

        {/* Temat */}
        {draftSubject && currentTopics.length > 0 && (
          <FilterRow label="Temat">
            <Pill active={!draftTopic} onClick={() => setDraftTopic("")}>
              Wszystkie
            </Pill>
            {currentTopics.map((t: any) => (
              <Pill
                key={t.id}
                active={draftTopic === t.id}
                onClick={() => setDraftTopic(t.id)}
              >
                {t.name.replace(/^[IVXLCDM]+\.\s*/, "")}{" "}
                <span className="opacity-50">{t.questionCount}</span>
              </Pill>
            ))}
          </FilterRow>
        )}

        {/* Typ */}
        <FilterRow label="Typ pytania">
          <Pill active={!draftType} onClick={() => setDraftType("")}>
            Dowolny
          </Pill>
          {ALL_TYPES.map((t) => (
            <Pill
              key={t}
              active={draftType === t}
              onClick={() => setDraftType(t)}
            >
              {TYPE_LABELS[t]}
            </Pill>
          ))}
        </FilterRow>

        {/* Trudność */}
        <FilterRow label="Trudność">
          <Pill
            active={!draftDifficulty}
            onClick={() => setDraftDifficulty("")}
          >
            Dowolna
          </Pill>
          {[1, 2, 3, 4, 5].map((d) => (
            <Pill
              key={d}
              active={draftDifficulty === String(d)}
              onClick={() => setDraftDifficulty(String(d))}
            >
              {d}
            </Pill>
          ))}
        </FilterRow>

        {/* Źródło */}
        <FilterRow label="Źródło">
          <Pill active={!draftSource} onClick={() => setDraftSource("")}>
            Dowolne
          </Pill>
          <Pill
            active={draftSource === "PP"}
            onClick={() => setDraftSource("PP")}
          >
            Podstawa (PP)
          </Pill>
          <Pill
            active={draftSource === "PR"}
            onClick={() => setDraftSource("PR")}
          >
            Rozszerzenie (PR)
          </Pill>
        </FilterRow>

        {/* Dodaj */}
        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={addGroup}
            disabled={
              !draftSubject && !draftType && !draftDifficulty && !draftSource
            }
            className="px-5 py-2.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            + Dodaj zbiór
          </button>
          <span className="text-xs text-zinc-400">
            {[
              currentSubject?.name,
              currentTopics.find((t: any) => t.id === draftTopic)?.name,
              draftType && TYPE_LABELS[draftType],
              draftDifficulty && `Poz.${draftDifficulty}`,
              draftSource,
            ]
              .filter(Boolean)
              .join(" · ") || "Wybierz filtr"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Tiny UI helpers ───────────────────────────────────────────────────
function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
        active
          ? "bg-brand-500 text-white shadow-md"
          : "bg-white dark:bg-surface-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 hover:border-brand-300"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600",
    sky: "bg-sky-100 dark:bg-sky-900/20 text-sky-600",
    emerald: "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600",
    amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600",
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${colors[color] || colors.indigo}`}
    >
      {children}
    </span>
  );
}
