// ============================================================================
// SessionHistory.tsx — Historia sesji z pełnym podglądem
// File: src/components/dashboard/SessionHistory.tsx
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import {
  sessions as sessionsApi,
  subjects as subjectsApi,
} from "../../lib/api";
import type {
  SessionSummary,
  SessionDetail,
  SessionTimelineItem,
} from "../../lib/api";
import { ChemText } from "../quiz/Chem";

// ── Mapowania ─────────────────────────────────────────────────────────────

const SESSION_TYPE_LABELS: Record<string, string> = {
  PRACTICE: "Ćwiczenia",
  TOPIC_DRILL: "Ćwicz temat",
  REVIEW: "Powtórka",
  MOCK_EXAM: "Próbna matura",
  ADAPTIVE: "Adaptacyjna",
};

const ACTION_LABELS: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  ANSWERED: {
    label: "Odpowiedziano",
    icon: "✏️",
    color:
      "text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/15",
  },
  SKIPPED: {
    label: "Pominięto",
    icon: "⏭️",
    color: "text-zinc-500 bg-zinc-100 dark:bg-zinc-800",
  },
  REVEALED: {
    label: "Podejrzano odpowiedź",
    icon: "👁️",
    color:
      "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/15",
  },
  VIEWED: {
    label: "Tylko wyświetlono",
    icon: "👀",
    color: "text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50",
  },
};

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

const DIFF_COLORS = [
  "",
  "text-emerald-600",
  "text-sky-600",
  "text-amber-600",
  "text-orange-600",
  "text-red-600",
];
const DIFF_BG = [
  "",
  "bg-emerald-100 dark:bg-emerald-900/20",
  "bg-sky-100 dark:bg-sky-900/20",
  "bg-amber-100 dark:bg-amber-900/20",
  "bg-orange-100 dark:bg-orange-900/20",
  "bg-red-100 dark:bg-red-900/20",
];
const DIFF_LABELS = ["", "Łatwe", "Podstawa", "Średnie", "Trudne", "Ekspert"];

// ── Component ─────────────────────────────────────────────────────────────

export function SessionHistory() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [filterSubject, setFilterSubject] = useState<string>("");
  const LIMIT = 15;

  // Load subjects for filter
  useEffect(() => {
    subjectsApi
      .list()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  // Load sessions
  const loadSessions = useCallback(
    async (newOffset = 0) => {
      setLoading(true);
      try {
        const data = await sessionsApi.myHistory({
          ...(filterSubject ? { subjectId: filterSubject } : {}),
          limit: LIMIT,
          offset: newOffset,
        });
        setSessions(data.sessions);
        setTotal(data.total);
        setOffset(newOffset);
      } catch (err) {
        console.error("Failed to load sessions:", err);
      } finally {
        setLoading(false);
      }
    },
    [filterSubject],
  );

  useEffect(() => {
    loadSessions(0);
  }, [loadSessions]);

  // Load session detail
  const openDetail = useCallback(async (sessionId: string) => {
    setSelectedSession(sessionId);
    setDetailLoading(true);
    try {
      const data = await sessionsApi.detail(sessionId);
      setDetail(data);
    } catch (err) {
      console.error("Failed to load session detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    setSelectedSession(null);
    setDetail(null);
  };

  // ── Detail view ─────────────────────────────────────────────────────────
  if (selectedSession) {
    return (
      <SessionDetailView
        detail={detail}
        loading={detailLoading}
        onBack={closeDetail}
      />
    );
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl">Historia sesji</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Przeglądaj swoje sesje nauki i szczegóły każdego pytania.
          </p>
        </div>

        {/* Subject filter */}
        <select
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="input w-auto min-w-[200px]"
        >
          <option value="">Wszystkie przedmioty</option>
          {subjects.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Stats summary */}
      {!loading && sessions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Sesji łącznie" value={total} />
          <MiniStat
            label="Pytań odpowiedz."
            value={sessions.reduce((s, x) => s + x.questionsAnswered, 0)}
          />
          <MiniStat
            label="Łączne XP"
            value={sessions.reduce((s, x) => s + x.totalXpEarned, 0)}
          />
          <MiniStat
            label="Kredyty AI"
            value={sessions.reduce((s, x) => s + x.aiCreditsUsed, 0)}
            icon="🤖"
          />
        </div>
      )}

      {/* Sessions list */}
      {loading ? (
        <LoadingSkeleton count={5} />
      ) : sessions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <span className="text-4xl block mb-3">📭</span>
          <p className="font-display font-semibold">Brak sesji</p>
          <p className="text-sm text-zinc-500 mt-1">
            Rozpocznij sesję nauki, aby zobaczyć historię.
          </p>
          <a href="/dashboard/sesja" className="btn-primary mt-4 inline-block">
            Nowa sesja
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onClick={() => openDetail(session.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={offset === 0}
            onClick={() => loadSessions(Math.max(0, offset - LIMIT))}
            className="btn-ghost text-sm disabled:opacity-40"
          >
            ← Poprzednie
          </button>
          <span className="text-xs text-zinc-500">
            {offset + 1}–{Math.min(offset + LIMIT, total)} z {total}
          </span>
          <button
            disabled={offset + LIMIT >= total}
            onClick={() => loadSessions(offset + LIMIT)}
            className="btn-ghost text-sm disabled:opacity-40"
          >
            Następne →
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SESSION CARD — list item
// ══════════════════════════════════════════════════════════════════════════

function SessionCard({
  session,
  onClick,
}: {
  session: SessionSummary;
  onClick: () => void;
}) {
  const d = session.actionBreakdown;
  const answered = d.ANSWERED || 0;
  const skipped = d.SKIPPED || 0;
  const revealed = d.REVEALED || 0;
  const duration = session.totalTimeMs
    ? formatDuration(session.totalTimeMs)
    : "—";
  const date = new Date(session.startedAt);
  const dateStr = date.toLocaleDateString("pl", {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
  const timeStr = date.toLocaleTimeString("pl", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      onClick={onClick}
      className="w-full text-left glass-card p-5 hover:shadow-lg hover:scale-[1.005] transition-all duration-200 group"
    >
      <div className="flex items-start gap-4">
        {/* Subject icon */}
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
          style={{
            background: (session.subject.color || "#6366f1") + "15",
          }}
        >
          {session.subject.icon}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-display font-semibold text-sm">
              {session.subject.name}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-surface-800 text-zinc-500 font-medium">
              {SESSION_TYPE_LABELS[session.type] || session.type}
            </span>
          </div>

          {/* Action breakdown pills */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {answered > 0 && (
              <ActionPill
                icon="✏️"
                count={answered}
                label="odpowiedzi"
                color="brand"
              />
            )}
            {session.correctAnswers > 0 && (
              <ActionPill
                icon="✅"
                count={session.correctAnswers}
                label="poprawnych"
                color="emerald"
              />
            )}
            {skipped > 0 && (
              <ActionPill
                icon="⏭️"
                count={skipped}
                label="pominięć"
                color="zinc"
              />
            )}
            {revealed > 0 && (
              <ActionPill
                icon="👁️"
                count={revealed}
                label="podejrzeń"
                color="amber"
              />
            )}
            {session.aiCreditsUsed > 0 && (
              <ActionPill
                icon="🤖"
                count={session.aiCreditsUsed}
                label="kr. AI"
                color="purple"
              />
            )}
          </div>

          {/* Bottom row */}
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span>
              {dateStr}, {timeStr}
            </span>
            <span>·</span>
            <span>{duration}</span>
            {session.accuracy > 0 && (
              <>
                <span>·</span>
                <span
                  className={
                    session.accuracy >= 80
                      ? "text-emerald-500 font-semibold"
                      : session.accuracy >= 50
                        ? "text-amber-500"
                        : "text-red-500"
                  }
                >
                  {session.accuracy}% celność
                </span>
              </>
            )}
          </div>
        </div>

        {/* XP + arrow */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {session.totalXpEarned > 0 && (
            <span className="xp-badge">+{session.totalXpEarned} XP</span>
          )}
          <svg
            className="w-5 h-5 text-zinc-300 dark:text-zinc-600 group-hover:text-brand-500 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}

function ActionPill({
  icon,
  count,
  label,
  color,
}: {
  icon: string;
  count: number;
  label: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    brand:
      "bg-brand-100/80 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400",
    emerald:
      "bg-emerald-100/80 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
    amber:
      "bg-amber-100/80 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    zinc: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
    purple:
      "bg-purple-100/80 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors[color] || colors.zinc}`}
    >
      <span>{icon}</span>
      {count} {label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SESSION DETAIL VIEW — full timeline
// ══════════════════════════════════════════════════════════════════════════

function SessionDetailView({
  detail,
  loading,
  onBack,
}: {
  detail: SessionDetail | null;
  loading: boolean;
  onBack: () => void;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const expandAll = () => {
    if (!detail) return;
    setExpandedItems(new Set(detail.timeline.map((_, i) => i)));
  };

  const collapseAll = () => setExpandedItems(new Set());

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button onClick={onBack} className="btn-ghost text-sm">
          ← Wróć do listy
        </button>
        <LoadingSkeleton count={4} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">Nie znaleziono sesji.</p>
        <button onClick={onBack} className="btn-ghost mt-4">
          ← Wróć
        </button>
      </div>
    );
  }

  const { session, timeline, stats } = detail;
  const date = new Date(session.startedAt);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back + title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-surface-800 hover:bg-zinc-200 dark:hover:bg-surface-700 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div>
          <h1 className="font-display font-bold text-xl flex items-center gap-2">
            <span>{session.subject.icon}</span>
            {session.subject.name}
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-surface-800 text-zinc-500 font-medium">
              {SESSION_TYPE_LABELS[session.type] || session.type}
            </span>
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {date.toLocaleDateString("pl", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            ·{" "}
            {date.toLocaleTimeString("pl", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {session.completedAt &&
              ` — ${new Date(session.completedAt).toLocaleTimeString("pl", {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <MiniStat label="Wyświetlone" value={stats.totalViewed} />
        <MiniStat label="Odpowiedziane" value={stats.answered} icon="✏️" />
        <MiniStat label="Pominięte" value={stats.skipped} icon="⏭️" />
        <MiniStat label="Podejrzane" value={stats.revealed} icon="👁️" />
        <MiniStat label="Kredyty AI" value={stats.totalAiCredits} icon="🤖" />
        <MiniStat label="XP" value={stats.totalXp} icon="⭐" />
      </div>

      {/* Accuracy + time */}
      {session.questionsAnswered > 0 && (
        <div className="flex items-center gap-6 p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800">
          <div className="flex items-center gap-2">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center font-display font-bold text-xl ${
                session.accuracy >= 80
                  ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600"
                  : session.accuracy >= 50
                    ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600"
                    : "bg-red-100 dark:bg-red-900/20 text-red-600"
              }`}
            >
              {session.accuracy}%
            </div>
            <div>
              <p className="text-sm font-semibold">Celność</p>
              <p className="text-[11px] text-zinc-500">
                {session.correctAnswers}/{session.questionsAnswered} poprawnych
              </p>
            </div>
          </div>
          {session.totalTimeMs > 0 && (
            <div>
              <p className="text-sm font-semibold">
                {formatDuration(session.totalTimeMs)}
              </p>
              <p className="text-[11px] text-zinc-500">Czas nauki</p>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-sm">
          Timeline ({timeline.length} pytań)
        </h2>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-[10px] text-brand-500 hover:text-brand-700 font-semibold"
          >
            Rozwiń wszystkie
          </button>
          <span className="text-zinc-300">|</span>
          <button
            onClick={collapseAll}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 font-semibold"
          >
            Zwiń
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {timeline.map((item, index) => (
          <TimelineItem
            key={`${item.questionId}-${index}`}
            item={item}
            index={index}
            expanded={expandedItems.has(index)}
            onToggle={() => toggleItem(index)}
          />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TIMELINE ITEM — expandable question card
// ══════════════════════════════════════════════════════════════════════════

function TimelineItem({
  item,
  index,
  expanded,
  onToggle,
}: {
  item: SessionTimelineItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const actionInfo = ACTION_LABELS[item.action] || ACTION_LABELS.VIEWED;
  const q = item.question;
  const content = q.content as any;

  // Extract question text (first line)
  const questionText =
    content.question ||
    content.instruction ||
    content.prompt ||
    content.context?.substring(0, 120) ||
    "(brak treści)";

  return (
    <div className="glass-card overflow-hidden transition-all duration-200">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-zinc-50/50 dark:hover:bg-surface-800/50 transition-colors"
      >
        {/* Number */}
        <span className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-surface-700 flex items-center justify-center text-[11px] font-bold text-zinc-500 flex-shrink-0 mt-0.5">
          {index + 1}
        </span>

        {/* Content preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* Action badge */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${actionInfo.color}`}
            >
              {actionInfo.icon} {actionInfo.label}
            </span>

            {/* Type */}
            <span className="text-[10px] text-zinc-400 font-medium">
              {TYPE_LABELS[q.type] || q.type}
            </span>

            {/* Difficulty */}
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${DIFF_BG[q.difficulty]} ${DIFF_COLORS[q.difficulty]}`}
            >
              {DIFF_LABELS[q.difficulty]}
            </span>

            {/* Score */}
            {item.action === "ANSWERED" && item.isCorrect !== null && (
              <span
                className={`text-[10px] font-bold ${item.isCorrect ? "text-emerald-500" : item.score && item.score > 0 ? "text-amber-500" : "text-red-500"}`}
              >
                {item.isCorrect
                  ? "✅"
                  : item.score && item.score > 0
                    ? `⚠️ ${Math.round(item.score * 100)}%`
                    : "❌"}
              </span>
            )}

            {/* AI credits */}
            {item.aiCreditsUsed > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-semibold">
                🤖 {item.aiCreditsUsed} kr.
              </span>
            )}

            {/* XP */}
            {item.xpEarned > 0 && (
              <span className="xp-badge text-[9px]">+{item.xpEarned} XP</span>
            )}
          </div>

          {/* Question text preview */}
          <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-1">
            <ChemText
              text={
                typeof questionText === "string"
                  ? questionText
                  : JSON.stringify(questionText)
              }
            />
          </p>

          {/* Topic */}
          <span className="text-[10px] text-zinc-400 mt-0.5 block">
            {q.topic.name}
          </span>
        </div>

        {/* Expand arrow */}
        <svg
          className={`w-5 h-5 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 p-5 space-y-5 animate-slide-up">
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
            {item.timeSpentMs && (
              <span>⏱ {formatDuration(item.timeSpentMs)}</span>
            )}
            {q.source && <span>📄 {q.source}</span>}
            {q.points && <span>{q.points} pkt</span>}
          </div>

          {/* Lektura / epoka */}
          {(content.work || content.epochLabel) && (
            <div className="flex flex-wrap items-center gap-2">
              {content.work && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/30">
                  📚 {content.work}
                </span>
              )}
              {content.epochLabel && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/30">
                  {content.epochLabel}
                </span>
              )}
            </div>
          )}

          {/* Full question */}
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800/80">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Treść pytania
            </p>
            <div className="text-sm whitespace-pre-wrap">
              <ChemText text={questionText} />
            </div>

            {/* Context for WIAZKA */}
            {content.context && q.type === "WIAZKA" && (
              <div className="mt-3 p-3 rounded-xl bg-navy-50 dark:bg-navy-900/10 border border-navy-200 dark:border-navy-800/30">
                <p className="text-xs whitespace-pre-line">
                  <ChemText text={content.context} />
                </p>
              </div>
            )}

            {/* Options for CLOSED / MULTI_SELECT */}
            {content.options && (
              <div className="mt-3 space-y-1.5">
                {content.options.map((o: any) => (
                  <div
                    key={o.id}
                    className={`flex items-start gap-2 px-3 py-2 rounded-xl text-xs ${
                      isCorrectOption(q.type, content, o.id)
                        ? "bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30 font-semibold"
                        : wasUserOption(item, o.id)
                          ? "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30"
                          : "bg-white dark:bg-surface-700"
                    }`}
                  >
                    <span className="font-bold text-zinc-500 w-5">{o.id}</span>
                    <span className="flex-1">
                      <ChemText text={o.text} />
                    </span>
                    {isCorrectOption(q.type, content, o.id) && (
                      <span className="text-brand-500 font-bold">✓</span>
                    )}
                    {wasUserOption(item, o.id) &&
                      !isCorrectOption(q.type, content, o.id) && (
                        <span className="text-red-500 font-bold">✗</span>
                      )}
                  </div>
                ))}
              </div>
            )}

            {/* Statements for TRUE_FALSE */}
            {content.statements && (
              <div className="mt-3 space-y-1.5">
                {content.statements.map((s: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-surface-700 text-xs"
                  >
                    <span className="flex-1">{s.text}</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-lg text-white text-[10px] ${s.isTrue ? "bg-brand-500" : "bg-red-500"}`}
                    >
                      {s.isTrue ? "PRAWDA" : "FAŁSZ"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Sub-questions for WIAZKA */}
            {content.subQuestions && (
              <div className="mt-3 space-y-3">
                {content.subQuestions.map((sq: any, i: number) => (
                  <div
                    key={sq.id}
                    className="p-3 rounded-xl bg-white dark:bg-surface-700"
                  >
                    <p className="text-xs font-medium mb-1">
                      <span className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-navy-500 text-white text-[10px] font-bold mr-1.5">
                        {String.fromCharCode(97 + i)}
                      </span>
                      <ChemText text={sq.text} />
                      <span className="text-zinc-400 ml-1">
                        ({sq.points || 1} pkt)
                      </span>
                    </p>
                    {sq.options && (
                      <div className="ml-6 mt-1 space-y-1">
                        {sq.options.map((o: any) => (
                          <div
                            key={o.id}
                            className={`text-[11px] px-2 py-1 rounded-lg ${
                              o.id === sq.correctAnswer
                                ? "bg-brand-50 dark:bg-brand-900/10 font-semibold"
                                : ""
                            }`}
                          >
                            <span className="font-bold text-zinc-400 mr-1">
                              {o.id}
                            </span>
                            <ChemText text={o.text} />
                            {o.id === sq.correctAnswer && (
                              <span className="text-brand-500 ml-1">✓</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {sq.sampleAnswer && (
                      <p className="ml-6 mt-1 text-[11px] text-sky-600 dark:text-sky-400">
                        Wzorcowa: {sq.sampleAnswer}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Blanks for FILL_IN / CLOZE */}
            {content.blanks && !content.subQuestions && (
              <div className="mt-3 space-y-1.5">
                {(Array.isArray(content.blanks)
                  ? content.blanks
                  : Object.entries(content.blanks).map(
                      ([k, v]: [string, any]) => ({ id: k, ...v }),
                    )
                ).map((b: any, i: number) => (
                  <div
                    key={b.id || i}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-surface-700 text-xs"
                  >
                    <span className="font-bold text-zinc-400">
                      Luka {i + 1}:
                    </span>
                    <span className="text-brand-600 dark:text-brand-400 font-semibold">
                      {b.acceptedAnswers?.[0] || "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Pairs for MATCHING */}
            {content.pairs && (
              <div className="mt-3 space-y-1.5">
                {content.pairs.map((p: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-surface-700 text-xs"
                  >
                    <span className="font-semibold flex-1">
                      <ChemText text={p.left} />
                    </span>
                    <span className="text-zinc-400">→</span>
                    <span className="text-brand-600 dark:text-brand-400 font-semibold flex-1 text-right">
                      {p.right}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Items for ORDERING */}
            {content.items && content.correctOrder && !content.subQuestions && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Poprawna kolejność:
                </p>
                {content.correctOrder.map((idx: number, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-surface-700 text-xs"
                  >
                    <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    <ChemText text={content.items[idx]} />
                  </div>
                ))}
              </div>
            )}

            {/* Graph SVG */}
            {content.graphSvg && (
              <div
                className="mt-3 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3"
                dangerouslySetInnerHTML={{ __html: content.graphSvg }}
              />
            )}

            {/* Table */}
            {content.table && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {content.table.headers.map((h: string, i: number) => (
                        <th
                          key={i}
                          className="px-3 py-1.5 bg-zinc-100 dark:bg-surface-700 text-left font-semibold border border-zinc-200 dark:border-zinc-700"
                        >
                          <ChemText text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {content.table.rows.map((row: string[], ri: number) => (
                      <tr key={ri}>
                        {row.map((cell: string, ci: number) => (
                          <td
                            key={ci}
                            className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700"
                          >
                            <ChemText text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* User's response */}
          {item.action === "ANSWERED" && item.response !== null && (
            <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30">
              <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-2">
                Twoja odpowiedź
              </p>
              <ResponseDisplay
                type={q.type}
                response={item.response}
                content={content}
              />
            </div>
          )}

          {/* AI Grading */}
          {item.aiGrading && (
            <AiGradingDisplay
              aiGrading={item.aiGrading}
              aiCredits={item.aiCreditsUsed}
            />
          )}

          {/* Explanation */}
          {q.explanation && q.explanation.length > 10 && (
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/30">
              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">
                Wyjaśnienie
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                <ChemText text={q.explanation} />
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function ResponseDisplay({
  type,
  response,
  content,
}: {
  type: string;
  response: any;
  content: any;
}) {
  if (response === null || response === undefined) return null;

  switch (type) {
    case "CLOSED":
      return (
        <p className="text-sm font-semibold">
          {response}
          {content.options && (
            <span className="text-zinc-500 font-normal ml-2">
              —{" "}
              {content.options.find((o: any) => o.id === response)?.text || ""}
            </span>
          )}
        </p>
      );

    case "MULTI_SELECT":
      return (
        <div className="space-y-1">
          {(response as string[]).map((id: string) => {
            const opt = content.options?.find((o: any) => o.id === id);
            return (
              <p key={id} className="text-xs">
                <span className="font-bold">{id}</span>
                {opt && (
                  <span className="text-zinc-500 ml-1">— {opt.text}</span>
                )}
              </p>
            );
          })}
        </div>
      );

    case "TRUE_FALSE":
      return (
        <div className="space-y-1">
          {(response as boolean[]).map((v: boolean, i: number) => (
            <p key={i} className="text-xs">
              {i + 1}.{" "}
              <span
                className={`font-bold ${v ? "text-brand-500" : "text-red-500"}`}
              >
                {v ? "Prawda" : "Fałsz"}
              </span>
            </p>
          ))}
        </div>
      );

    case "OPEN":
    case "ESSAY":
      return <p className="text-sm whitespace-pre-wrap">{response}</p>;

    case "FILL_IN":
    case "CLOZE":
      if (typeof response === "object" && !Array.isArray(response)) {
        return (
          <div className="space-y-1">
            {Object.entries(response).map(([k, v]) => (
              <p key={k} className="text-xs">
                <span className="font-bold text-zinc-500">{k}:</span>{" "}
                <span className="font-semibold">{String(v)}</span>
              </p>
            ))}
          </div>
        );
      }
      return <p className="text-sm">{JSON.stringify(response)}</p>;

    case "MATCHING":
      if (typeof response === "object") {
        return (
          <div className="space-y-1">
            {Object.entries(response).map(([left, right]) => (
              <p key={left} className="text-xs">
                {left} <span className="text-zinc-400">→</span>{" "}
                <span className="font-semibold">{String(right)}</span>
              </p>
            ))}
          </div>
        );
      }
      return null;

    case "ORDERING":
      if (Array.isArray(response)) {
        return (
          <div className="space-y-1">
            {(response as number[]).map((idx, i) => (
              <p key={i} className="text-xs">
                {i + 1}.{" "}
                <ChemText text={content.items?.[idx] || `Element ${idx}`} />
              </p>
            ))}
          </div>
        );
      }
      return null;

    case "WIAZKA":
      if (typeof response === "object") {
        return (
          <div className="space-y-2">
            {Object.entries(response).map(([sqId, val]) => {
              const sq = content.subQuestions?.find((s: any) => s.id === sqId);
              const label = sq
                ? String.fromCharCode(97 + content.subQuestions.indexOf(sq))
                : sqId;
              return (
                <div key={sqId} className="text-xs">
                  <span className="font-bold text-zinc-500">{label})</span>{" "}
                  {typeof val === "string" ? (
                    <span className="font-semibold">{val}</span>
                  ) : Array.isArray(val) ? (
                    <span>{val.map((v: any) => String(v)).join(", ")}</span>
                  ) : typeof val === "object" ? (
                    <span>{JSON.stringify(val)}</span>
                  ) : (
                    <span>{String(val)}</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
      return null;

    case "CALCULATION":
      if (typeof response === "object" && response.value !== undefined) {
        return (
          <div>
            <p className="text-sm font-semibold">Wynik: {response.value}</p>
            {response.steps && (
              <p className="text-xs text-zinc-500 mt-1 whitespace-pre-wrap">
                {response.steps}
              </p>
            )}
          </div>
        );
      }
      return <p className="text-sm font-semibold">{String(response)}</p>;

    default:
      return (
        <pre className="text-xs text-zinc-600 whitespace-pre-wrap overflow-x-auto">
          {typeof response === "string"
            ? response
            : JSON.stringify(response, null, 2)}
        </pre>
      );
  }
}

function AiGradingDisplay({
  aiGrading,
  aiCredits,
}: {
  aiGrading: any;
  aiCredits: number;
}) {
  if (!aiGrading) return null;

  return (
    <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/30">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🤖</span>
        <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
          Ocena AI
        </p>
        {aiCredits > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-200 dark:bg-purple-800/30 text-purple-700 dark:text-purple-300 font-semibold ml-auto">
            {aiCredits} kr. zużytych
          </span>
        )}
      </div>

      {/* Global feedback */}
      {aiGrading.feedback && (
        <p className="text-xs text-zinc-700 dark:text-zinc-300 mb-2">
          {aiGrading.feedback}
        </p>
      )}

      {/* Per-blank feedback */}
      {aiGrading.blanks && (
        <div className="space-y-1.5 mt-2">
          {Object.entries(aiGrading.blanks).map(([k, r]: [string, any]) => (
            <div
              key={k}
              className={`p-2 rounded-lg text-[11px] ${r.score >= 0.5 ? "bg-brand-50/50 dark:bg-brand-900/5" : "bg-red-50/50 dark:bg-red-900/5"}`}
            >
              <span className="font-bold">
                {r.score >= 0.5 ? "✅" : "❌"} {k}:
              </span>{" "}
              {r.feedback}
            </div>
          ))}
        </div>
      )}

      {/* Per-sub-question feedback */}
      {aiGrading.subQuestions && (
        <div className="space-y-1.5 mt-2">
          {Object.entries(aiGrading.subQuestions).map(
            ([k, r]: [string, any]) => (
              <div
                key={k}
                className={`p-2 rounded-lg text-[11px] ${r.score >= 0.5 ? "bg-brand-50/50 dark:bg-brand-900/5" : "bg-red-50/50 dark:bg-red-900/5"}`}
              >
                <span className="font-bold">
                  {r.score >= 0.5 ? "✅" : "❌"} {k}
                  {r.pointsEarned !== undefined && ` (${r.pointsEarned} pkt)`}:
                </span>{" "}
                {r.feedback}
                {r.correctAnswer && (
                  <p className="text-sky-600 dark:text-sky-400 mt-0.5">
                    Wzorcowa: {r.correctAnswer}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {/* Per-field feedback (EXPERIMENT_DESIGN) */}
      {aiGrading.fields && (
        <div className="space-y-1.5 mt-2">
          {Object.entries(aiGrading.fields).map(([k, r]: [string, any]) => (
            <div
              key={k}
              className={`p-2 rounded-lg text-[11px] ${r.score >= 0.5 ? "bg-brand-50/50 dark:bg-brand-900/5" : "bg-red-50/50 dark:bg-red-900/5"}`}
            >
              <span className="font-bold">
                {r.score >= 0.5 ? "✅" : "❌"} {k}
                {r.pointsEarned !== undefined && ` (${r.pointsEarned} pkt)`}:
              </span>{" "}
              {r.feedback}
            </div>
          ))}
        </div>
      )}

      {/* Correct answer from AI */}
      {aiGrading.correctAnswer &&
        !aiGrading.blanks &&
        !aiGrading.subQuestions && (
          <p className="text-xs text-sky-600 dark:text-sky-400 mt-2">
            Wzorcowa: {aiGrading.correctAnswer}
          </p>
        )}
    </div>
  );
}

function isCorrectOption(
  type: string,
  content: any,
  optionId: string,
): boolean {
  if (type === "CLOSED") return content.correctAnswer === optionId;
  if (type === "MULTI_SELECT")
    return content.correctAnswers?.includes(optionId);
  return false;
}

function wasUserOption(item: SessionTimelineItem, optionId: string): boolean {
  if (item.response === null) return false;
  if (typeof item.response === "string") return item.response === optionId;
  if (Array.isArray(item.response)) return item.response.includes(optionId);
  return false;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}min ${sec > 0 ? `${sec}s` : ""}`.trim();
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m > 0 ? `${m}min` : ""}`.trim();
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-surface-800 text-center">
      <div className="font-display font-bold text-lg">
        {icon && <span className="mr-1">{icon}</span>}
        {value}
      </div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

function LoadingSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"
        />
      ))}
    </div>
  );
}
