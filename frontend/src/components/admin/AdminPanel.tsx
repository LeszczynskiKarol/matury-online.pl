import { useState, useEffect, useCallback } from "react";
import { admin } from "../../lib/api";
import { ListeningLab } from "./ListeningLab";
import { ExplanationGenerator } from "./ExplanationGenerator";
import { ClaudeMonitor } from "./ClaudeMonitor";
import { AdminExport } from "./AdminExport";
import { AdminQuestionLog } from "./AdminQuestionLog";
import { AdminReports } from "./AdminReports";

type Tab =
  | "dashboard"
  | "questions"
  | "users"
  | "subjects"
  | "listening"
  | "question-log"
  | "claude"
  | "reports"
  | "export"
  | "explanations";

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("dashboard");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Start", icon: "📊" },
    { id: "questions", label: "Pytania", icon: "❓" },
    { id: "users", label: "Userzy", icon: "👥" },
    { id: "subjects", label: "Przedmioty", icon: "📚" },
    { id: "explanations", label: "Explanations", icon: "📝" },
    { id: "claude", label: "Claude API", icon: "🤖" },
    { id: "export", label: "Eksport", icon: "📥" },
    { id: "question-log", label: "Log pytań", icon: "📜" },
    { id: "reports", label: "Zgłoszenia", icon: "🚩" },
    { id: "listening", label: "Listening Lab", icon: "🎧" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">
          Panel Administracyjny
        </h1>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-5 gap-1.5 border-b border-zinc-200 dark:border-zinc-700 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl transition-all ${
              tab === t.id
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-zinc-100 dark:bg-surface-800 dark:text-zinc-100 hover:text-zinc-700 hover:bg-zinc-200 dark:hover:bg-surface-700"
            }`}
          >
            <span>{t.icon}</span>
            {t.label && <span className="hidden sm:inline">{t.label}</span>}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <AdminDashboard />}
      {tab === "questions" && <AdminQuestions />}
      {tab === "users" && <AdminUsers />}
      {tab === "subjects" && <AdminSubjects />}
      {tab === "claude" && <ClaudeMonitor />}
      {tab === "question-log" && <AdminQuestionLog />}
      {tab === "export" && <AdminExport />}
      {tab === "reports" && <AdminReports />}
      {tab === "explanations" && <ExplanationGenerator />}
      {tab === "listening" && <ListeningLab />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════

function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    admin.stats().then(setStats).catch(console.error);
  }, []);

  if (!stats) return <Loading />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Użytkownicy"
          value={stats.users.total}
          sub={`${stats.users.premium} premium · ${stats.users.recentSignups} nowi (7d)`}
        />
        <Stat
          label="Pytania"
          value={stats.content.totalQuestions}
          sub={`${stats.content.activeQuestions} aktywne`}
        />
        <Stat
          label="Odpowiedzi"
          value={stats.activity.totalAnswers}
          sub={`${stats.activity.todayAnswers} dziś`}
        />
        <Stat
          label="MRR"
          value={`${stats.revenue.estimatedMRR.toFixed(0)} zł`}
          sub={`${stats.revenue.activeSubs} aktywnych subskr.`}
        />
      </div>

      <div className="glass-card p-6">
        <h3 className="font-display font-semibold mb-4">
          Pytania per przedmiot
        </h3>
        <div className="space-y-3">
          {stats.subjects.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="text-lg w-8">{s.icon}</span>
              <span className="w-32 text-sm font-medium">{s.name}</span>
              <div className="flex-1 progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${Math.min(100, (s._count.questions / Math.max(1, stats.content.totalQuestions)) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-sm font-mono w-16 text-right">
                {s._count.questions}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// QUESTIONS MANAGER
// ════════════════════════════════════════════════════════════════════════════

function AdminQuestions() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [jsonView, setJsonView] = useState<any>(null);
  const [filters, setFilters] = useState({
    search: "",
    subjectId: "",
    topicId: "",
    type: "",
    difficulty: "",
    isActive: "true",
    offset: 0,
    limit: 20,
  });
  const [subjects, setSubjects] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    admin.questions(filters).then((d) => {
      setQuestions(d.questions);
      setTotal(d.total);
    });
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    admin.subjects().then(setSubjects);
  }, []);
  useEffect(() => {
    if (filters.subjectId) admin.topics(filters.subjectId).then(setTopics);
    else setTopics([]);
  }, [filters.subjectId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Usunąć pytanie (soft delete)?")) return;
    await admin.deleteQuestion(id);
    load();
  };

  const handleRestore = async (id: string) => {
    await admin.restoreQuestion(id);
    load();
  };

  const TYPES = [
    "CLOSED",
    "MULTI_SELECT",
    "OPEN",
    "FILL_IN",
    "ESSAY",
    "MATCHING",
    "ORDERING",
    "TRUE_FALSE",
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium mb-1">
          Szukaj w treści
        </label>
        <input
          value={filters.search}
          onChange={(e) =>
            setFilters({ ...filters, search: e.target.value, offset: 0 })
          }
          className="input py-2 text-sm"
          placeholder="Szukaj pytania..."
        />
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <Sel
          label="Przedmiot"
          value={filters.subjectId}
          onChange={(v) =>
            setFilters({ ...filters, subjectId: v, topicId: "", offset: 0 })
          }
          options={[
            { v: "", l: "Wszystkie" },
            ...subjects.map((s: any) => ({
              v: s.id,
              l: `${s.icon} ${s.name}`,
            })),
          ]}
        />
        {topics.length > 0 && (
          <Sel
            label="Temat"
            value={filters.topicId}
            onChange={(v) => setFilters({ ...filters, topicId: v, offset: 0 })}
            options={[
              { v: "", l: "Wszystkie" },
              ...topics
                .filter((t: any) => t.depth === 0)
                .map((t: any) => ({ v: t.id, l: t.name })),
            ]}
          />
        )}
        <Sel
          label="Typ"
          value={filters.type}
          onChange={(v) => setFilters({ ...filters, type: v, offset: 0 })}
          options={[
            { v: "", l: "Wszystkie" },
            ...TYPES.map((t) => ({ v: t, l: t })),
          ]}
        />
        <Sel
          label="Trudność"
          value={filters.difficulty}
          onChange={(v) => setFilters({ ...filters, difficulty: v, offset: 0 })}
          options={[
            { v: "", l: "Wszystkie" },
            ...["1", "2", "3", "4", "5"].map((d) => ({ v: d, l: `${d}` })),
          ]}
        />
        <Sel
          label="Status"
          value={filters.isActive}
          onChange={(v) => setFilters({ ...filters, isActive: v, offset: 0 })}
          options={[
            { v: "true", l: "Aktywne" },
            { v: "false", l: "Usunięte" },
            { v: "", l: "Wszystkie" },
          ]}
        />
        <button
          onClick={() => setCreating(true)}
          className="btn-primary text-xs py-2 px-4"
        >
          + Dodaj pytanie
        </button>
      </div>

      <p className="text-xs text-zinc-500">Łącznie: {total} pytań</p>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
              <th className="py-2 px-3 font-medium text-xs text-zinc-500">
                Przedmiot
              </th>
              <th className="py-2 px-3 font-medium text-xs text-zinc-500">
                Temat
              </th>
              <th className="py-2 px-3 font-medium text-xs text-zinc-500">
                Typ
              </th>
              <th className="py-2 px-3 font-medium text-xs text-zinc-500">
                Trudność
              </th>
              <th className="py-2 px-3 font-medium text-xs text-zinc-500">
                Treść
              </th>
              <th className="py-2 px-3 font-medium text-xs text-zinc-500">
                Próby
              </th>
              <th className="py-2 px-3 font-medium text-xs text-zinc-500">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr
                key={q.id}
                className={`border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-surface-800 ${!q.isActive ? "opacity-40" : ""}`}
              >
                <td className="py-2 px-3">
                  {q.subject?.icon} {q.subject?.name}
                </td>
                <td className="py-2 px-3 text-xs">{q.topic?.name}</td>
                <td className="py-2 px-3">
                  <span className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">
                    {q.type}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <DiffDots n={q.difficulty} />
                </td>
                <td className="py-2 px-3 max-w-xs truncate text-xs">
                  {q.content?.question || q.content?.prompt || "—"}
                </td>
                <td className="py-2 px-3 text-xs font-mono">
                  {q.totalAttempts} ({q.correctCount}✓)
                </td>
                <td className="py-2 px-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setJsonView(q)}
                      className="px-2 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 font-mono"
                    >
                      {"{}"}
                    </button>
                    <button
                      onClick={() => setEditing(q)}
                      className="px-2 py-1 text-xs rounded-lg bg-navy-100 dark:bg-navy-900/30 text-navy-600 dark:text-navy-400 hover:bg-navy-200"
                    >
                      Edytuj
                    </button>
                    {q.isActive ? (
                      <button
                        onClick={() => handleDelete(q.id)}
                        className="px-2 py-1 text-xs rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 hover:bg-red-200"
                      >
                        Usuń
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRestore(q.id)}
                        className="px-2 py-1 text-xs rounded-lg bg-brand-100 dark:bg-brand-900/20 text-brand-600 hover:bg-brand-200"
                      >
                        Przywróć
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <button
          disabled={filters.offset === 0}
          onClick={() =>
            setFilters({
              ...filters,
              offset: Math.max(0, filters.offset - filters.limit),
            })
          }
          className="btn-ghost text-xs disabled:opacity-30"
        >
          ← Poprzednie
        </button>
        <span className="text-xs text-zinc-500">
          {filters.offset + 1}–{Math.min(filters.offset + filters.limit, total)}{" "}
          z {total}
        </span>
        <button
          disabled={filters.offset + filters.limit >= total}
          onClick={() =>
            setFilters({ ...filters, offset: filters.offset + filters.limit })
          }
          className="btn-ghost text-xs disabled:opacity-30"
        >
          Następne →
        </button>
      </div>

      {/* Edit modal */}
      {editing && (
        <QuestionModal
          question={editing}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onSave={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {creating && (
        <QuestionModal
          question={null}
          subjects={subjects}
          onClose={() => setCreating(false)}
          onSave={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {jsonView && (
        <JsonModal data={jsonView} onClose={() => setJsonView(null)} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// QUESTION EDIT/CREATE MODAL
// ════════════════════════════════════════════════════════════════════════════

function QuestionModal({
  question,
  subjects,
  onClose,
  onSave,
}: {
  question: any;
  subjects: any[];
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = !!question?.id;
  const [form, setForm] = useState({
    subjectId: question?.subjectId || "",
    topicId: question?.topicId || "",
    type: question?.type || "CLOSED",
    difficulty: question?.difficulty || 1,
    points: question?.points || 1,
    content: JSON.stringify(question?.content || {}, null, 2),
    explanation: question?.explanation || "",
    source: question?.source || "",
  });
  const [topics, setTopics] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (form.subjectId) admin.topics(form.subjectId).then(setTopics);
  }, [form.subjectId]);

  const handleSave = async () => {
    setError("");
    let content: any;
    try {
      content = JSON.parse(form.content);
    } catch {
      setError("Niepoprawny JSON w content");
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...form,
        content,
        difficulty: parseInt(form.difficulty as any),
        points: parseInt(form.points as any),
      };
      if (isEdit) {
        await admin.updateQuestion(question.id, data);
      } else {
        await admin.createQuestion(data);
      }
      onSave();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">
            {isEdit ? "Edytuj pytanie" : "Nowe pytanie"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Sel
            label="Przedmiot"
            value={form.subjectId}
            onChange={(v) => setForm({ ...form, subjectId: v, topicId: "" })}
            options={subjects.map((s: any) => ({
              v: s.id,
              l: `${s.icon} ${s.name}`,
            }))}
          />
          <Sel
            label="Temat"
            value={form.topicId}
            onChange={(v) => setForm({ ...form, topicId: v })}
            options={topics.map((t: any) => ({
              v: t.id,
              l: `${"  ".repeat(t.depth || 0)}${t.name}`,
            }))}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Sel
            label="Typ"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v })}
            options={[
              "CLOSED",
              "MULTI_SELECT",
              "OPEN",
              "FILL_IN",
              "ESSAY",
              "MATCHING",
              "ORDERING",
              "TRUE_FALSE",
            ].map((t) => ({ v: t, l: t }))}
          />
          <div>
            <label className="block text-xs font-medium mb-1">
              Trudność (1-5)
            </label>
            <input
              type="number"
              min="1"
              max="5"
              value={form.difficulty}
              onChange={(e) =>
                setForm({
                  ...form,
                  difficulty: parseInt(e.target.value) as any,
                })
              }
              className="input py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Punkty</label>
            <input
              type="number"
              min="1"
              value={form.points}
              onChange={(e) =>
                setForm({ ...form, points: parseInt(e.target.value) as any })
              }
              className="input py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">
            Content (JSON)
          </label>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={12}
            className="input font-mono text-xs resize-y"
          />
          <p className="text-[10px] text-zinc-400 mt-1">
            CLOSED:{" "}
            {`{ "question": "...", "options": [{"id":"A","text":"..."}], "correctAnswer": "A" }`}
            <br />
            OPEN:{" "}
            {`{ "question": "...", "rubric": "...", "maxPoints": 5, "sampleAnswer": "..." }`}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Wyjaśnienie</label>
          <textarea
            value={form.explanation}
            onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            rows={2}
            className="input text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Źródło</label>
          <input
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            className="input py-2 text-sm"
            placeholder="np. Matura 2024, autorskie"
          />
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost text-sm">
            Anuluj
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.subjectId || !form.topicId}
            className="btn-primary text-sm disabled:opacity-40"
          >
            {saving
              ? "Zapisuję..."
              : isEdit
                ? "Zapisz zmiany"
                : "Utwórz pytanie"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// USERS MANAGER
// ════════════════════════════════════════════════════════════════════════════

function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    offset: 0,
    limit: 30,
  });
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const load = useCallback(() => {
    admin.users(filters).then((d) => {
      setUsers(d.users);
      setTotal(d.total);
    });
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGrant = async (id: string) => {
    const days = prompt("Ile dni Premium?", "30");
    if (!days) return;
    await admin.grantPremium(id, parseInt(days));
    load();
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Cofnąć Premium?")) return;
    await admin.revokePremium(id);
    load();
  };

  const handleRoleToggle = async (id: string, currentRole: string) => {
    await admin.updateUser(id, {
      role: currentRole === "ADMIN" ? "STUDENT" : "ADMIN",
    });
    load();
  };

  const statusColors: Record<string, string> = {
    FREE: "bg-zinc-100 text-zinc-600",
    ACTIVE: "bg-brand-100 text-brand-700",
    ONE_TIME: "bg-blue-100 text-blue-700",
    PAST_DUE: "bg-amber-100 text-amber-700",
    CANCELLED: "bg-red-100 text-red-700",
    EXPIRED: "bg-zinc-200 text-zinc-500",
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1">Szukaj</label>
          <input
            value={filters.search}
            onChange={(e) =>
              setFilters({ ...filters, search: e.target.value, offset: 0 })
            }
            className="input py-2 text-sm"
            placeholder="Email lub imię..."
          />
        </div>
        <Sel
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v, offset: 0 })}
          options={[
            { v: "", l: "Wszystkie" },
            { v: "FREE", l: "Free" },
            { v: "ACTIVE", l: "Active" },
            { v: "ONE_TIME", l: "One-time" },
            { v: "PAST_DUE", l: "Past due" },
            { v: "CANCELLED", l: "Cancelled" },
          ]}
        />
      </div>

      <p className="text-xs text-zinc-500">Łącznie: {total} użytkowników</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
              <th className="py-2 px-3 text-xs font-medium text-zinc-500">
                Użytkownik
              </th>
              <th className="py-2 px-3 text-xs font-medium text-zinc-500">
                Status
              </th>
              <th className="py-2 px-3 text-xs font-medium text-zinc-500">
                Rola
              </th>
              <th className="py-2 px-3 text-xs font-medium text-zinc-500">
                XP / Level
              </th>
              <th className="py-2 px-3 text-xs font-medium text-zinc-500">
                Streak
              </th>
              <th className="py-2 px-3 text-xs font-medium text-zinc-500">
                Aktywność
              </th>
              <th className="py-2 px-3 text-xs font-medium text-zinc-500">
                Data
              </th>
              <th className="py-2 px-3 text-xs font-medium text-zinc-500">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-surface-800"
              >
                <td className="py-2 px-3">
                  <div className="font-medium text-sm">{u.name || "—"}</div>
                  <div className="text-xs text-zinc-500">{u.email}</div>
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${statusColors[u.subscriptionStatus] || ""}`}
                  >
                    {u.subscriptionStatus}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`text-xs font-mono ${u.role === "ADMIN" ? "text-red-500" : ""}`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="py-2 px-3 text-xs font-mono">
                  {u.totalXp} / Poziom {u.globalLevel}
                </td>
                <td className="py-2 px-3 text-xs">
                  {u.currentStreak > 0 ? `🔥 ${u.currentStreak}d` : "—"}
                </td>
                <td className="py-2 px-3 text-xs">
                  {u._count.answers}odp · {u._count.sessions}ses
                </td>
                <td className="py-2 px-3 text-xs text-zinc-500">
                  {u.createdAt
                    ? new Date(u.createdAt).toLocaleDateString("pl")
                    : "—"}
                </td>
                <td className="py-2 px-3">
                  <div className="flex gap-1 flex-wrap">
                    {u.subscriptionStatus === "FREE" ? (
                      <button
                        onClick={() => handleGrant(u.id)}
                        className="px-2 py-1 text-[10px] rounded-lg bg-brand-100 text-brand-700 hover:bg-brand-200"
                      >
                        +Premium
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRevoke(u.id)}
                        className="px-2 py-1 text-[10px] rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                      >
                        −Premium
                      </button>
                    )}
                    <button
                      onClick={() => handleRoleToggle(u.id, u.role)}
                      className="px-2 py-1 text-[10px] rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200"
                    >
                      {u.role === "ADMIN" ? "→Student" : "→Admin"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          disabled={filters.offset === 0}
          onClick={() =>
            setFilters({
              ...filters,
              offset: Math.max(0, filters.offset - filters.limit),
            })
          }
          className="btn-ghost text-xs disabled:opacity-30"
        >
          ← Poprzednie
        </button>
        <span className="text-xs text-zinc-500">
          {filters.offset + 1}–{Math.min(filters.offset + filters.limit, total)}{" "}
          z {total}
        </span>
        <button
          disabled={filters.offset + filters.limit >= total}
          onClick={() =>
            setFilters({ ...filters, offset: filters.offset + filters.limit })
          }
          className="btn-ghost text-xs disabled:opacity-30"
        >
          Następne →
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUBJECTS MANAGER
// ════════════════════════════════════════════════════════════════════════════

function AdminSubjects() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [editingTopic, setEditingTopic] = useState<any>(null);
  const [newTopic, setNewTopic] = useState(false);

  const loadSubjects = () => admin.subjects().then(setSubjects);
  const loadTopics = (sid: string) => admin.topics(sid).then(setTopics);

  useEffect(() => {
    loadSubjects();
  }, []);
  useEffect(() => {
    if (selectedSubject) loadTopics(selectedSubject);
  }, [selectedSubject]);

  const saveSubject = async (data: any) => {
    if (data.id) {
      await admin.updateSubject(data.id, data);
    } else {
      await admin.createSubject(data);
    }
    loadSubjects();
    setEditingSubject(null);
  };

  const saveTopic = async (data: any) => {
    if (data.id) {
      await admin.updateTopic(data.id, data);
    } else {
      await admin.createTopic({ ...data, subjectId: selectedSubject });
    }
    loadTopics(selectedSubject);
    setEditingTopic(null);
    setNewTopic(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Subjects list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold">Przedmioty</h3>
          <button
            onClick={() => setEditingSubject({})}
            className="btn-primary text-xs py-1.5 px-3"
          >
            + Nowy przedmiot
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {subjects.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedSubject(s.id)}
              className={`subject-card p-4 text-center cursor-pointer ${selectedSubject === s.id ? "ring-2 ring-brand-500" : ""}`}
            >
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="font-display font-semibold text-xs">{s.name}</div>
              <div className="text-[10px] text-zinc-500">
                {s._count?.questions || 0} pytań · {s._count?.topics || 0}{" "}
                tematów
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingSubject(s);
                }}
                className="mt-2 text-[10px] text-navy-500 hover:underline"
              >
                Edytuj
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Topics for selected subject */}
      {selectedSubject && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold">
              Tematy — {subjects.find((s) => s.id === selectedSubject)?.name}
            </h3>
            <button
              onClick={() => setNewTopic(true)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              + Nowy temat
            </button>
          </div>
          <div className="space-y-2">
            {topics
              .filter((t) => t.depth === 0 || !t.parentId)
              .map((t) => (
                <div key={t.id} className="glass-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm">{t.name}</span>
                      {t.dateFrom && (
                        <span className="text-xs text-zinc-500 ml-2">
                          {t.dateFrom}–{t.dateTo}
                        </span>
                      )}
                      <span className="text-xs text-zinc-400 ml-2">
                        {t.questionCount} pytań
                      </span>
                    </div>
                    <button
                      onClick={() => setEditingTopic(t)}
                      className="text-xs text-navy-500 hover:underline"
                    >
                      Edytuj
                    </button>
                  </div>
                  {t.children?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {t.children.map((c: any) => (
                        <span
                          key={c.id}
                          className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs cursor-pointer hover:bg-zinc-200"
                          onClick={() => setEditingTopic(c)}
                        >
                          {c.name} {c.author && `(${c.author})`}{" "}
                          <span className="text-zinc-400">
                            {c.questionCount}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Subject edit modal */}
      {editingSubject && (
        <Modal
          title={editingSubject.id ? "Edytuj przedmiot" : "Nowy przedmiot"}
          onClose={() => setEditingSubject(null)}
        >
          <SimpleForm
            fields={[
              { name: "slug", label: "Slug", value: editingSubject.slug || "" },
              {
                name: "name",
                label: "Nazwa",
                value: editingSubject.name || "",
              },
              {
                name: "icon",
                label: "Ikona",
                value: editingSubject.icon || "",
              },
              {
                name: "color",
                label: "Kolor (hex)",
                value: editingSubject.color || "",
              },
              {
                name: "description",
                label: "Opis",
                value: editingSubject.description || "",
              },
              {
                name: "sortOrder",
                label: "Kolejność",
                value: editingSubject.sortOrder || 0,
                type: "number",
              },
            ]}
            onSave={(data) => saveSubject({ ...editingSubject, ...data })}
          />
        </Modal>
      )}

      {/* Topic edit modal */}
      {(editingTopic || newTopic) && (
        <Modal
          title={editingTopic?.id ? "Edytuj temat" : "Nowy temat"}
          onClose={() => {
            setEditingTopic(null);
            setNewTopic(false);
          }}
        >
          <SimpleForm
            fields={[
              { name: "slug", label: "Slug", value: editingTopic?.slug || "" },
              { name: "name", label: "Nazwa", value: editingTopic?.name || "" },
              {
                name: "author",
                label: "Autor (opcj.)",
                value: editingTopic?.author || "",
              },
              {
                name: "dateFrom",
                label: "Data od",
                value: editingTopic?.dateFrom || "",
              },
              {
                name: "dateTo",
                label: "Data do",
                value: editingTopic?.dateTo || "",
              },
              {
                name: "sortOrder",
                label: "Kolejność",
                value: editingTopic?.sortOrder || 0,
                type: "number",
              },
              {
                name: "depth",
                label: "Głębokość (0=root)",
                value: editingTopic?.depth || 0,
                type: "number",
              },
            ]}
            onSave={(data) => saveTopic({ ...(editingTopic || {}), ...data })}
          />
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: any;
  sub?: string;
}) {
  return (
    <div className="stat-card">
      <div className="font-display font-bold text-2xl">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
      {sub && <div className="text-[10px] text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
}

function Sel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input py-2 text-sm min-w-[120px]"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}

function DiffDots({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i <= n ? "bg-brand-500" : "bg-zinc-200 dark:bg-zinc-700"}`}
        />
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-lg"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SimpleForm({
  fields,
  onSave,
}: {
  fields: { name: string; label: string; value: any; type?: string }[];
  onSave: (data: any) => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(
    Object.fromEntries(fields.map((f) => [f.name, f.value])),
  );

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.name}>
          <label className="block text-xs font-medium mb-1">{f.label}</label>
          <input
            type={f.type || "text"}
            value={form[f.name] ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                [f.name]:
                  f.type === "number"
                    ? parseInt(e.target.value) || 0
                    : e.target.value,
              })
            }
            className="input py-2 text-sm"
          />
        </div>
      ))}
      <div className="flex justify-end pt-2">
        <button onClick={() => onSave(form)} className="btn-primary text-sm">
          Zapisz
        </button>
      </div>
    </div>
  );
}

function JsonModal({ data, onClose }: { data: any; onClose: () => void }) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-3xl max-h-[90vh] flex flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg">JSON</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(json);
              }}
              className="px-3 py-1 text-xs rounded-lg bg-brand-100 dark:bg-brand-900/20 text-brand-600 hover:bg-brand-200"
            >
              Kopiuj
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-lg"
            >
              ✕
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto text-xs font-mono bg-zinc-50 dark:bg-surface-800 p-4 rounded-xl leading-relaxed whitespace-pre-wrap break-all">
          {json}
        </pre>
      </div>
    </div>
  );
}
