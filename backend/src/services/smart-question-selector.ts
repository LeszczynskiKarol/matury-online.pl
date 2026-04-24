// ============================================================================
// Smart Question Selector — Scoring-based selection with diversity guarantees
// v2 — fixes after question-log analysis (April 2026)
//
// CHANGELOG v2:
// 1. Hard-exclude questions answered/skipped < 1h ago (was: soft penalty only)
// 2. Skip-rate per type — deprioritize types user consistently skips
// 3. Quadratic topic penalty — prevents "Język w użyciu" flooding
// 4. OPEN questions capped at 2 per session
// 5. Stronger recency penalty curve for < 1h
// ============================================================================

import { PrismaClient } from "@prisma/client";

interface CandidateQuestion {
  id: string;
  type: string;
  difficulty: number;
  points: number;
  topicId: string;
  content: any;
  source: string | null;
  topic: { id: string; name: string; slug: string };
  totalAttempts: number;
  correctCount: number;
}

interface SelectionParams {
  userId: string;
  subjectId: string;
  topicId?: string;
  topicIds?: string[];
  types?: string[];
  difficulties?: number[];
  sources?: string[];
  exclude?: string[];
  count: number;
  context?: "SESSION" | "POOL";
}

interface ScoredQuestion {
  question: CandidateQuestion;
  score: number;
}

const QUESTION_SELECT = {
  id: true,
  type: true,
  difficulty: true,
  points: true,
  topicId: true,
  content: true,
  source: true,
  topic: { select: { id: true, name: true, slug: true, parentId: true } },
  totalAttempts: true,
  correctCount: true,
} as const;

// ── Tuning constants ───────────────────────────────────────────────────────
const HARD_EXCLUDE_MS = 60 * 60 * 1000; // 1 hour — zero chance of repeat
const HISTORY_WINDOW = 300; // answers to load (was 200)

// ────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ────────────────────────────────────────────────────────────────────────────

export async function selectSmartQuestions(
  prisma: PrismaClient,
  params: SelectionParams,
): Promise<{ questions: CandidateQuestion[]; total: number }> {
  const {
    userId,
    subjectId,
    topicId,
    topicIds,
    types,
    difficulties,
    sources,
    exclude = [],
    count,
  } = params;

  // ── 1. Build WHERE clause ────────────────────────────────────────────
  const where: any = { subjectId, isActive: true };

  const topicFilter = topicIds?.length ? topicIds : topicId ? [topicId] : [];
  if (topicFilter.length > 0) where.topicId = { in: topicFilter };
  if (types?.length) where.type = { in: types };
  if (difficulties?.length) where.difficulty = { in: difficulties };
  if (sources?.length) where.source = { in: sources };
  if (exclude.length > 0) where.id = { notIn: exclude };

  const total = await prisma.question.count({ where });

  // ── 2. Load user history ─────────────────────────────────────────────
  const recentAnswers = await prisma.answer.findMany({
    where: {
      userId,
      question: { subjectId },
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_WINDOW,
    select: {
      questionId: true,
      createdAt: true,
      isCorrect: true,
      score: true,
    },
  });

  const answeredIds = new Set(recentAnswers.map((a) => a.questionId));

  // Map: questionId → history entry
  const historyMap = new Map<
    string,
    {
      lastAnswered: Date;
      wasCorrect: boolean;
      answerCount: number;
      wasSkipped: boolean;
    }
  >();
  for (const ans of recentAnswers) {
    const isSkip = ans.isCorrect === null && ans.score === 0;
    if (!historyMap.has(ans.questionId)) {
      historyMap.set(ans.questionId, {
        lastAnswered: ans.createdAt,
        wasCorrect: ans.isCorrect ?? false,
        answerCount: 1,
        wasSkipped: isSkip,
      });
    } else {
      historyMap.get(ans.questionId)!.answerCount++;
    }
  }

  // ── 2b. HARD-EXCLUDE: pytania z ostatniej godziny ────────────────────
  const hardExcludeCutoff = Date.now() - HARD_EXCLUDE_MS;
  const recentHardExclude: string[] = [];
  for (const ans of recentAnswers) {
    if (ans.createdAt.getTime() > hardExcludeCutoff) {
      recentHardExclude.push(ans.questionId);
    }
  }
  const fullExclude = [...new Set([...exclude, ...recentHardExclude])];

  // ── 3. Load candidates ───────────────────────────────────────────────
  // Fresh (never answered)
  const freshWhere = {
    ...where,
    id: {
      notIn: [...fullExclude, ...answeredIds],
    },
  };

  let candidates = await prisma.question.findMany({
    where: freshWhere,
    select: QUESTION_SELECT,
    take: Math.min(count * 5, 200),
    orderBy: { totalAttempts: "asc" },
  });

  // Backfill with answered (but NOT hard-excluded)
  if (candidates.length < count) {
    const freshIds = new Set(candidates.map((q) => q.id));
    const backfillExclude = [...fullExclude, ...Array.from(freshIds)];

    const backfill = await prisma.question.findMany({
      where: {
        ...where,
        ...(backfillExclude.length > 0
          ? { id: { notIn: backfillExclude } }
          : {}),
      },
      select: QUESTION_SELECT,
      take: Math.min((count - candidates.length) * 3, 100),
      orderBy: { totalAttempts: "asc" },
    });

    candidates = [...candidates, ...backfill];
  }

  if (candidates.length === 0) {
    return { questions: [], total };
  }

  // ── 3b. Compute skip-rate per question type ──────────────────────────
  const skipRateByType = computeSkipRates(recentAnswers, candidates);

  // ── 4. Score each candidate ──────────────────────────────────────────
  const scored = candidates.map((q) =>
    scoreQuestion(q, historyMap, answeredIds, skipRateByType),
  );

  // ── 5. Diversity-aware selection ─────────────────────────────────────
  const selected = diverseSelect(scored, count);

  return {
    questions: selected.map((s) => s.question),
    total,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// SKIP-RATE COMPUTATION — behavioural signal per question type
// ────────────────────────────────────────────────────────────────────────────

function computeSkipRates(
  recentAnswers: {
    questionId: string;
    isCorrect: boolean | null;
    score: number | null;
  }[],
  candidates: CandidateQuestion[],
): Map<string, number> {
  // Build questionId → type map from candidates
  const typeMap = new Map<string, string>();
  for (const c of candidates) typeMap.set(c.id, c.type);

  const typeStats = new Map<string, { total: number; skips: number }>();

  for (const ans of recentAnswers) {
    const qType = typeMap.get(ans.questionId);
    if (!qType) continue; // question not in current candidate pool, skip
    const s = typeStats.get(qType) || { total: 0, skips: 0 };
    s.total++;
    if (ans.isCorrect === null && (ans.score === 0 || ans.score === null)) {
      s.skips++;
    }
    typeStats.set(qType, s);
  }

  const result = new Map<string, number>();
  for (const [type, stats] of typeStats) {
    if (stats.total >= 3) {
      // minimum 3 attempts to form a pattern
      result.set(type, stats.skips / stats.total);
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// SCORING
// ────────────────────────────────────────────────────────────────────────────

function scoreQuestion(
  q: CandidateQuestion,
  historyMap: Map<
    string,
    {
      lastAnswered: Date;
      wasCorrect: boolean;
      answerCount: number;
      wasSkipped: boolean;
    }
  >,
  answeredIds: Set<string>,
  skipRateByType: Map<string, number>,
): ScoredQuestion {
  let score = 1000;

  // ── Freshness bonus ──────────────────────────────────────────────────
  if (!answeredIds.has(q.id)) {
    score += 500;
  } else {
    const history = historyMap.get(q.id);
    if (history) {
      const hoursSince =
        (Date.now() - history.lastAnswered.getTime()) / 3_600_000;
      const daysSince = hoursSince / 24;

      // Very recent (< 6h) — strong penalty (covers the 1h hard-exclude gap)
      if (hoursSince < 6) {
        score -= 600;
      } else if (daysSince < 2) {
        score -= 300;
      }

      // Old enough to revisit (> 7 days)
      if (daysSince > 7) {
        score += Math.min(400, Math.floor((daysSince - 7) * 40));
      }

      // Skipped questions — extra penalty
      if (history.wasSkipped) {
        score -= 400;
      }

      // Wrong answer review window (1h-1d after mistake → slight bonus)
      if (
        !history.wasCorrect &&
        !history.wasSkipped &&
        hoursSince > 1 &&
        daysSince < 1
      ) {
        score += Math.floor(200 * (1 - Math.exp(-daysSince * 4)));
      }

      // Seen too many times
      if (history.answerCount > 3) {
        score -= history.answerCount * 50;
      }
    }
  }

  // ── Global popularity ────────────────────────────────────────────────
  if (q.totalAttempts === 0) {
    score += 200;
  } else if (q.totalAttempts < 5) {
    score += 100;
  }

  // ── Type skip-rate penalty (behavioural) ─────────────────────────────
  const typeSkipRate = skipRateByType.get(q.type) || 0;
  if (typeSkipRate > 0.7) {
    // User skips >70% of this type → heavy penalty
    score -= 500;
  } else if (typeSkipRate > 0.5) {
    score -= 250;
  } else if (typeSkipRate > 0.3) {
    score -= 100;
  }

  // ── Random jitter ────────────────────────────────────────────────────
  score += Math.floor(Math.random() * 120) - 60;

  return { question: q, score };
}

// ────────────────────────────────────────────────────────────────────────────
// DIVERSE SELECT
// ────────────────────────────────────────────────────────────────────────────

function diverseSelect(
  scored: ScoredQuestion[],
  count: number,
): ScoredQuestion[] {
  scored.sort((a, b) => b.score - a.score);

  // ── Count distinct topics in candidate pool for adaptive cap ─────────
  const distinctTopics = new Set(scored.map((s) => s.question.topicId)).size;
  // polski (48 tematów, 10 pytań) → cap 2
  // biologia (4 tematy, 10 pytań) → cap 4
  // chemia (8 tematów, 10 pytań) → cap 2
  const topicCap = Math.max(2, Math.ceil((count * 1.3) / distinctTopics));

  const selected: ScoredQuestion[] = [];
  const topicCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const workCounts = new Map<string, number>();
  const epochCounts = new Map<string, number>();

  for (const candidate of scored) {
    if (selected.length >= count) break;

    const q = candidate.question;
    const topicCount = topicCounts.get(q.topicId) || 0;
    const typeCount = typeCounts.get(q.type) || 0;
    const work = (q.content as any)?.work || "__none__";
    const workCount = workCounts.get(work) || 0;
    const epochKey = (q.topic as any)?.parentId || q.topicId;
    const epochCount = epochCounts.get(epochKey) || 0;

    let adjustedScore = candidate.score;

    // ── Topic cap — adaptive per subject ────────────────────────────────
    // Hard block above cap, quadratic penalty below
    if (topicCount >= topicCap) {
      adjustedScore -= 5000; // hard block
    } else if (topicCount >= 1) {
      adjustedScore -= topicCount * topicCount * 100;
    }

    // ── Type penalty — stricter, with OPEN cap ─────────────────────────
    if (typeCount >= 3) {
      adjustedScore -= typeCount * 150;
    }
    // Hard cap: max 2 OPEN/ESSAY questions per session
    if ((q.type === "OPEN" || q.type === "ESSAY") && typeCount >= 2) {
      adjustedScore -= 2000;
    }

    // ── Literary work — max 1 ──────────────────────────────────────────
    if (work !== "__none__" && workCount >= 1) {
      adjustedScore -= workCount * 300;
    }

    // ── Epoch diversity ────────────────────────────────────────────────
    if (epochCount >= 3) {
      adjustedScore -= (epochCount - 2) * 250;
    } else if (epochCount === 0) {
      adjustedScore += 150;
    }

    // Skip if score tanked and we have alternatives
    if (adjustedScore < 0 && scored.length - selected.length > count * 0.5) {
      continue;
    }

    selected.push(candidate);
    topicCounts.set(q.topicId, topicCount + 1);
    typeCounts.set(q.type, typeCount + 1);
    workCounts.set(work, workCount + 1);
    epochCounts.set(epochKey, epochCount + 1);
  }

  // Backfill if diversity was too aggressive
  if (selected.length < count) {
    const selectedIds = new Set(selected.map((s) => s.question.id));
    for (const candidate of scored) {
      if (selected.length >= count) break;
      if (!selectedIds.has(candidate.question.id)) {
        selected.push(candidate);
      }
    }
  }

  // Final shuffle
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected;
}
