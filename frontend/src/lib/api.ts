// ============================================================================
// API Client — type-safe fetch wrapper for matury-online backend
// ============================================================================

const API_BASE = import.meta.env.PUBLIC_API_URL || "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.code || "UNKNOWN",
      body.error || res.statusText,
    );
  }

  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────

export const auth = {
  register: (data: { email: string; password: string; name?: string }) =>
    request<{ user: any; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ user: any; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  google: (credential: string) =>
    request<{ user: any; token: string }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),

  me: () => request<any>("/auth/me"),

  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
};

// ── Subjects ─────────────────────────────────────────────────────────────

export const subjects = {
  list: () => request<any[]>("/subjects"),

  get: (slug: string) => request<any>(`/subjects/${slug}`),

  progress: (slug: string) => request<any>(`/subjects/${slug}/progress`),

  select: (subjectIds: string[]) =>
    request<{ selected: number }>("/subjects/select", {
      method: "POST",
      body: JSON.stringify({ subjectIds }),
    }),
};

// ── Sessions ─────────────────────────────────────────────────────────────

export const sessions = {
  create: (data: {
    subjectId: string;
    type: string;
    topicId?: string;
    topicIds?: string[];
    difficulty?: number;
    difficulties?: number[];
    questionCount?: number;
    questionTypes?: string[];
    sources?: string[];
  }) =>
    request<{ sessionId: string; type: string; questions: any[] }>(
      "/sessions/create",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),

  complete: (id: string) =>
    request<any>(`/sessions/${id}/complete`, { method: "POST" }),

  history: (params?: { subjectId?: string; limit?: number }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<any[]>(`/sessions/history?${qs}`);
  },
};

// ── Answers ──────────────────────────────────────────────────────────────

export const answers = {
  submit: (data: {
    questionId: string;
    response: any;
    sessionId?: string;
    timeSpentMs?: number;
  }) =>
    request<{
      answerId: string;
      isCorrect: boolean | null;
      score: number;
      xpEarned: number;
      aiGrading: any;
      explanation: string | null;
      correctAnswer: any;
      gamification: {
        totalXp: number;
        globalLevel: number;
        subjectXp: number;
        subjectLevel: number;
        leveledUp: boolean;
        streak: number;
        isNewDay: boolean;
        adaptiveDifficulty: number;
        achievements: {
          slug: string;
          name: string;
          icon: string;
          xpReward: number;
        }[];
      };
    }>("/answers/submit", { method: "POST", body: JSON.stringify(data) }),
};

// ── Essays ───────────────────────────────────────────────────────────────

export const essays = {
  submit: (data: {
    subjectId: string;
    topicId: string;
    prompt: string;
    content: string;
    timeSpentMs?: number;
  }) =>
    request<any>("/essays/submit", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  history: (params?: { subjectId?: string; limit?: number }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<any[]>(`/essays/history?${qs}`);
  },

  get: (id: string) => request<any>(`/essays/${id}`),
};

// ── Review (Spaced Repetition) ───────────────────────────────────────────

export const review = {
  due: (params?: { topicId?: string; limit?: number }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<any[]>(`/review/due?${qs}`);
  },

  submit: (data: { cardId: string; quality: number }) =>
    request<any>("/review/submit", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  stats: () =>
    request<{ dueCount: number; totalCards: number; masteredCount: number }>(
      "/review/stats",
    ),
};

export const questions = {
  pool: (params: {
    subjectId: string;
    topicIds?: string[];
    types?: string[];
    difficulties?: number[];
    sources?: string[];
    exclude?: string[];
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    qs.set("subjectId", params.subjectId);
    qs.set("shuffle", "true");
    if (params.topicIds?.length) qs.set("topicIds", params.topicIds.join(","));
    if (params.types?.length) qs.set("types", params.types.join(","));
    if (params.difficulties?.length)
      qs.set("difficulties", params.difficulties.join(","));
    if (params.sources?.length) qs.set("sources", params.sources.join(","));
    if (params.exclude?.length) qs.set("exclude", params.exclude.join(","));
    if (params.limit) qs.set("limit", String(params.limit));
    return request<{ questions: any[]; total: number }>(`/questions?${qs}`);
  },

  filterOptions: (subjectId: string) =>
    request<{
      topics: {
        id: string;
        name: string;
        slug: string;
        questionCount: number;
      }[];
      types: { type: string; count: number }[];
      difficulties: { difficulty: number; count: number }[];
      sources: { source: string; count: number }[];
      totalQuestions: number;
    }>(`/questions/filter-options?subjectId=${subjectId}`),
};
// ── Gamification ─────────────────────────────────────────────────────────

export const gamification = {
  achievements: () =>
    request<{ earned: any[]; locked: any[] }>("/gamification/achievements"),
  level: () => request<any>("/gamification/level"),
  leaderboard: (subjectId?: string) => {
    const qs = subjectId ? `?subjectId=${subjectId}` : "";
    return request<any[]>(`/gamification/leaderboard${qs}`);
  },
  streak: () => request<any>("/gamification/streak"),
};

// ── Dashboard ────────────────────────────────────────────────────────────

export const dashboard = {
  main: () => request<any>("/dashboard"),
  subject: (slug: string) => request<any>(`/dashboard/subject/${slug}`),
};

// ── Stripe ───────────────────────────────────────────────────────────────

export const stripe = {
  checkout: (plan: "subscription" | "one_time") =>
    request<{ url: string }>("/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),

  portal: () => request<{ url: string }>("/stripe/portal", { method: "POST" }),

  status: () =>
    request<{
      isPremium: boolean;
      subscriptionStatus: string;
      subscriptionEnd: string | null;
      willExpire: string | null;
      canResume: boolean;
    }>("/stripe/status"),

  cancel: () =>
    request<{ message: string; accessUntil: string }>("/stripe/cancel", {
      method: "POST",
    }),

  resume: () =>
    request<{ message: string }>("/stripe/resume", { method: "POST" }),

  credits: () =>
    request<{ allowed: boolean; remaining: number; total: number }>(
      "/stripe/credits",
    ),

  buyCredits: (pkg: "credits_200" | "credits_500" | "credits_1200") =>
    request<{ url: string }>("/stripe/buy-credits", {
      method: "POST",
      body: JSON.stringify({ package: pkg }),
    }),
};

// ── Admin ────────────────────────────────────────────────────────────────

export const admin = {
  stats: () => request<any>("/admin/stats"),

  // Questions
  questions: (params?: Record<string, any>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params || {}).filter(
          ([, v]) => v !== "" && v !== undefined,
        ),
      ),
    ).toString();
    return request<{ questions: any[]; total: number }>(
      `/admin/questions?${qs}`,
    );
  },
  getQuestion: (id: string) => request<any>(`/admin/questions/${id}`),
  createQuestion: (data: any) =>
    request<any>("/admin/questions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateQuestion: (id: string, data: any) =>
    request<any>(`/admin/questions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteQuestion: (id: string) =>
    request<any>(`/admin/questions/${id}`, { method: "DELETE" }),
  restoreQuestion: (id: string) =>
    request<any>(`/admin/questions/${id}/restore`, { method: "POST" }),

  // Subjects
  subjects: () => request<any[]>("/admin/subjects"),
  createSubject: (data: any) =>
    request<any>("/admin/subjects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSubject: (id: string, data: any) =>
    request<any>(`/admin/subjects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Topics
  topics: (subjectId?: string) =>
    request<any[]>(
      `/admin/topics${subjectId ? `?subjectId=${subjectId}` : ""}`,
    ),
  createTopic: (data: any) =>
    request<any>("/admin/topics", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTopic: (id: string, data: any) =>
    request<any>(`/admin/topics/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Users
  users: (params?: Record<string, any>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params || {}).filter(
          ([, v]) => v !== "" && v !== undefined,
        ),
      ),
    ).toString();
    return request<{ users: any[]; total: number }>(`/admin/users?${qs}`);
  },
  getUser: (id: string) => request<any>(`/admin/users/${id}`),
  updateUser: (id: string, data: any) =>
    request<any>(`/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  grantPremium: (id: string, days: number) =>
    request<any>(`/admin/users/${id}/grant-premium`, {
      method: "POST",
      body: JSON.stringify({ days }),
    }),
  revokePremium: (id: string) =>
    request<any>(`/admin/users/${id}/revoke-premium`, { method: "POST" }),
  deleteUser: (id: string) =>
    request<any>(`/admin/users/${id}`, { method: "DELETE" }),

  seedAchievements: () =>
    request<any>("/admin/achievements/seed", { method: "POST" }),
};

export { ApiError };
