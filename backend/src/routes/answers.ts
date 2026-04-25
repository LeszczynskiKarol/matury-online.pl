// ============================================================================
// Answer Routes — Core Learning Loop
// submit → grade → xp → adaptive difficulty → spaced repetition → achievements
// ============================================================================

import { Prisma } from "@prisma/client";
import { FastifyPluginAsync } from "fastify";
import { gradeListeningQuestion } from "../services/listening-grading.js";
import { gradeOpenQuestion } from "../services/ai-grading.js";
import {
  calculateXp,
  awardXp,
  updateStreak,
  checkAchievements,
} from "../services/gamification.js";
import { updateAdaptiveDifficulty } from "../services/adaptive-difficulty.js";
import {
  ensureReviewCard,
  answerToQuality,
  processReview,
} from "../services/spaced-repetition.js";

export const answerRoutes: FastifyPluginAsync = async (app) => {
  // ── Submit answer ────────────────────────────────────────────────────────
  app.post(
    "/submit",
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["questionId", "response"],
          properties: {
            questionId: { type: "string" },
            response: {}, // flexible — type depends on question
            sessionId: { type: "string" },
            timeSpentMs: { type: "number" },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user.userId;
      const { questionId, response, sessionId, timeSpentMs } = req.body as any;

      // ── Fetch question ───────────────────────────────────────────────────
      const question = await app.prisma.question.findUnique({
        where: { id: questionId },
        include: { subject: { select: { slug: true } } },
      });
      if (!question)
        return reply.code(404).send({ error: "Question not found" });

      // ── Premium required ─────────────────────────────────────────────────
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: req.user.userId },
        select: {
          subscriptionStatus: true,
          subscriptionEnd: true,
          currentStreak: true,
        },
      });

      const now = new Date();
      const isPremium =
        user.subscriptionStatus === "ACTIVE" ||
        (user.subscriptionStatus === "ONE_TIME" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now) ||
        (user.subscriptionStatus === "CANCELLED" &&
          user.subscriptionEnd &&
          user.subscriptionEnd > now);

      if (!isPremium) {
        return reply.code(403).send({
          error: "Dostęp do zadań wymaga aktywnej subskrypcji Premium.",
          code: "PREMIUM_REQUIRED",
        });
      }
      // ── Grade ────────────────────────────────────────────────────────────
      const content = question.content as Record<string, any>;
      let isCorrect: boolean | null = null;
      let score = 0;
      let aiGrading = null;

      switch (question.type) {
        case "CLOSED": {
          isCorrect = response === content.correctAnswer;
          score = isCorrect ? 1.0 : 0.0;
          break;
        }
        case "LISTENING": {
          // Grading is deterministic (no AI) — credits were already consumed
          // at generation time in /listening/start and /listening/next.
          const result = gradeListeningQuestion(
            question.content as any,
            response,
          );
          isCorrect = result.isCorrect;
          score = result.score;
          break;
        }
        case "MULTI_SELECT": {
          const correct = new Set(content.correctAnswers as string[]);
          const submitted = new Set(response as string[]);
          const intersection = [...correct].filter((x) => submitted.has(x));
          score = intersection.length / correct.size;
          isCorrect = score >= 1.0;
          break;
        }
        case "TRUE_FALSE": {
          const statements = content.statements as {
            text: string;
            isTrue: boolean;
          }[];
          let correctCount = 0;
          const userAnswers = response as boolean[];
          statements.forEach((s, i) => {
            if (s.isTrue === userAnswers[i]) correctCount++;
          });
          score = correctCount / statements.length;
          isCorrect = score >= 1.0;
          break;
        }
        case "FILL_IN": {
          const blanks = content.blanks as {
            id: string;
            label?: string;
            acceptedAnswers: string[];
          }[];
          let correctCount = 0;
          const userAnswers = response as Record<string, string>;
          const fillAiResults: Record<string, any> = {};

          for (const blank of blanks) {
            const userAns = (userAnswers[blank.id] || "").trim().toLowerCase();

            // ── Deterministic first ──
            if (
              blank.acceptedAnswers.some(
                (a: string) => a.toLowerCase().trim() === userAns,
              )
            ) {
              correctCount++;
            }
            // ── AI fallback ──
            else if (userAns.length > 0) {
              try {
                const { requireAiCredits } =
                  await import("../services/ai-credits.js");
                await requireAiCredits(app.prisma, userId);

                const aiResult = await gradeOpenQuestion({
                  subjectSlug: question.subject.slug,
                  question: content.question || blank.label || "",
                  rubric: `Luka "${blank.id}": wzorcowa odpowiedź to: ${blank.acceptedAnswers.join(" / ")}. Uczeń wpisał: "${userAnswers[blank.id]}". Oceń czy odpowiedź jest poprawna merytorycznie (synonim, inna poprawna forma). Bądź LIBERALNY — jeśli sens się zgadza, uznaj za poprawne.`,
                  maxPoints: 1,
                  userAnswer: userAnswers[blank.id],
                  sampleAnswer: blank.acceptedAnswers[0],
                  userId,
                  caller: "ai-grading-fill-in",
                });

                if (aiResult.isCorrect || aiResult.score >= 0.5) {
                  correctCount++;
                }
                fillAiResults[blank.id] = {
                  score: aiResult.score,
                  feedback: aiResult.feedback,
                };
              } catch (err: any) {
                console.error(
                  `[FILL_IN AI fallback] blank=${blank.id} error:`,
                  err.message || err,
                );
                fillAiResults[blank.id] = {
                  score: 0,
                  feedback:
                    "Brak kredytów AI. Poprawna: " + blank.acceptedAnswers[0],
                };
              }
            }
          }

          score = correctCount / blanks.length;
          isCorrect = score >= 1.0;

          if (Object.keys(fillAiResults).length > 0) {
            aiGrading = { blanks: fillAiResults };
          }
          break;
        }
        case "MATCHING": {
          const pairs = content.pairs as { left: string; right: string }[];
          const userPairs = response as Record<string, string>;
          let correctCount = 0;
          for (const pair of pairs) {
            if (userPairs[pair.left] === pair.right) correctCount++;
          }
          score = correctCount / pairs.length;
          isCorrect = score >= 1.0;
          break;
        }
        case "ORDERING": {
          const correctOrder = content.correctOrder as number[];
          const userOrder = response as number[];
          let correctCount = 0;
          correctOrder.forEach((v, i) => {
            if (v === userOrder[i]) correctCount++;
          });
          score = correctCount / correctOrder.length;
          isCorrect = score >= 1.0;
          break;
        }
        case "ERROR_FIND": {
          // response is step id (number or string), correctErrorStep is number
          const userStep =
            typeof response === "string" ? parseInt(response, 10) : response;
          const correctStep = content.correctErrorStep;
          isCorrect = userStep === correctStep;
          score = isCorrect ? 1.0 : 0.0;
          break;
        }
        case "PROOF_ORDER": {
          const correctOrd = content.correctOrder as string[];
          const userOrd = response as string[];
          if (correctOrd && userOrd) {
            let correct = 0;
            correctOrd.forEach((v, i) => {
              if (v === userOrd[i]) correct++;
            });
            score = correct / correctOrd.length;
            isCorrect = score >= 1.0;
          }
          break;
        }
        case "CLOZE": {
          const blanksObj = content.blanks as Record<
            string,
            { acceptedAnswers: string[] }
          >;
          const userCloze = response as Record<string, string>;
          const keys = Object.keys(blanksObj);
          let correct = 0;
          const clozeAiResults: Record<string, any> = {};

          for (const k of keys) {
            const userVal = (userCloze[k] || "").trim().toLowerCase();

            // ── Deterministic first ──
            if (
              blanksObj[k].acceptedAnswers.some(
                (a: string) => a.toLowerCase().trim() === userVal,
              )
            ) {
              correct++;
            }
            // ── AI fallback ──
            else if (userVal.length > 0) {
              try {
                const { requireAiCredits } =
                  await import("../services/ai-credits.js");
                await requireAiCredits(app.prisma, userId);

                const aiResult = await gradeOpenQuestion({
                  subjectSlug: question.subject.slug,
                  question: `${content.instruction || ""}\nZdanie: ${content.template || ""}`,
                  rubric: `Luka "${k}": wzorcowa odpowiedź to: ${blanksObj[k].acceptedAnswers.join(" / ")}. Uczeń wpisał: "${userCloze[k]}". Oceń czy w KONTEKŚCIE CAŁEGO ZDANIA odpowiedź ucznia jest poprawna gramatycznie i merytorycznie (może być synonim lub inna poprawna forma). Bądź LIBERALNY — jeśli zdanie z odpowiedzią ucznia ma sens, uznaj za poprawne.`,
                  maxPoints: 1,
                  userAnswer: userCloze[k],
                  sampleAnswer: blanksObj[k].acceptedAnswers[0],
                  userId,
                  caller: "ai-grading-cloze",
                });

                if (aiResult.isCorrect || aiResult.score >= 0.5) {
                  correct++;
                }
                clozeAiResults[k] = {
                  score: aiResult.score,
                  feedback: aiResult.feedback,
                };
              } catch (err: any) {
                console.error(
                  `[CLOZE AI fallback] blank=${k} error:`,
                  err.message || err,
                );
                clozeAiResults[k] = {
                  score: 0,
                  feedback:
                    "Brak kredytów AI. Poprawna: " +
                    blanksObj[k].acceptedAnswers[0],
                };
              }
            }
          }

          score = keys.length > 0 ? correct / keys.length : 0;
          isCorrect = score >= 1.0;

          if (Object.keys(clozeAiResults).length > 0) {
            aiGrading = { blanks: clozeAiResults };
          }
          break;
        }
        case "GRAPH_INTERPRET":
        case "TABLE_DATA": {
          const subs = content.subQuestions as {
            id: string;
            text?: string;
            acceptedAnswers?: string[];
          }[];
          const userSubs = response as Record<string, string>;
          if (subs?.length) {
            let totalEarned = 0;
            const subAiResults: Record<string, any> = {};

            for (const sq of subs) {
              const uv = (userSubs[sq.id] || "").trim().toLowerCase();

              // ── Try deterministic first ──
              if (
                sq.acceptedAnswers?.some(
                  (a: string) => a.toLowerCase().trim() === uv,
                )
              ) {
                totalEarned++;
              }
              // ── AI fallback if user wrote something but no exact match ──
              else if (uv.length > 0 && sq.acceptedAnswers?.length) {
                try {
                  const { requireAiCredits } =
                    await import("../services/ai-credits.js");
                  await requireAiCredits(app.prisma, userId);

                  const aiResult = await gradeOpenQuestion({
                    subjectSlug: question.subject.slug,
                    question: sq.text || content.question || "",
                    rubric: `Poprawne odpowiedzi to: ${sq.acceptedAnswers.join(", ")}. Oceń czy odpowiedź ucznia jest merytorycznie równoważna.`,
                    maxPoints: 1,
                    userAnswer: userSubs[sq.id],
                    sampleAnswer: sq.acceptedAnswers[0],
                    userId,
                    caller: `ai-grading-${question.type.toLowerCase()}`,
                  });

                  if (aiResult.isCorrect || aiResult.score >= 0.5) {
                    totalEarned++;
                  }
                  subAiResults[sq.id] = {
                    score: aiResult.score,
                    feedback: aiResult.feedback,
                  };
                } catch (err: any) {
                  console.error(
                    `[${question.type} AI fallback] sub=${sq.id} error:`,
                    err.message || err,
                  );
                  subAiResults[sq.id] = {
                    score: 0,
                    feedback:
                      "Brak kredytów AI — nie oceniono. Poprawna: " +
                      sq.acceptedAnswers[0],
                  };
                }
              }
            }

            score = totalEarned / subs.length;
            isCorrect = score >= 1.0;

            if (Object.keys(subAiResults).length > 0) {
              aiGrading = { subQuestions: subAiResults };
            }
          }
          break;
        }
        case "WIAZKA": {
          // Complex — multiple sub-questions, partial grading
          const wSubs = content.subQuestions as any[];
          const wResp = response as Record<string, any>;
          let earned = 0,
            max = 0;
          const wiazkaAiResults: Record<string, any> = {};

          for (const sq of wSubs) {
            const pts = sq.points || 1;
            max += pts;

            // ── CLOSED — deterministic ──
            if (sq.type === "CLOSED" && wResp[sq.id] === sq.correctAnswer) {
              earned += pts;
            }
            // ── TRUE_FALSE — deterministic ──
            else if (
              sq.type === "TRUE_FALSE" &&
              sq.statements &&
              Array.isArray(wResp[sq.id])
            ) {
              const allOk = sq.statements.every(
                (st: any, i: number) => wResp[sq.id][i] === st.isTrue,
              );
              if (allOk) earned += pts;
            }
            // ── MULTI_SELECT — deterministic ──
            else if (sq.type === "MULTI_SELECT" && sq.correctAnswers) {
              const correct = new Set<string>(sq.correctAnswers as string[]);
              const submitted = new Set<string>(
                Array.isArray(wResp[sq.id]) ? (wResp[sq.id] as string[]) : [],
              );
              const hits = [...correct].filter((x) => submitted.has(x));
              const falsePos = [...submitted].filter((x) => !correct.has(x));
              if (hits.length === correct.size && falsePos.length === 0) {
                earned += pts;
              }
            }
            // ── FILL_IN with acceptedAnswers — deterministic ──
            else if (sq.type === "FILL_IN" && sq.acceptedAnswers) {
              const uv = (typeof wResp[sq.id] === "string" ? wResp[sq.id] : "")
                .trim()
                .toLowerCase();
              if (
                sq.acceptedAnswers.some(
                  (a: string) => a.toLowerCase().trim() === uv,
                )
              ) {
                earned += pts;
              }
            }
            // ── FILL_IN with blanks object — deterministic ──
            else if (
              sq.type === "FILL_IN" &&
              sq.blanks &&
              typeof wResp[sq.id] === "object"
            ) {
              const subAns = wResp[sq.id] as Record<string, string>;
              const blankEntries = Object.entries(sq.blanks) as [string, any][];
              let blankCorrect = 0;
              for (const [blankId, blank] of blankEntries) {
                const uv = (subAns[blankId] || "").trim().toLowerCase();
                if (
                  blank.acceptedAnswers?.some(
                    (a: string) => a.toLowerCase().trim() === uv,
                  )
                ) {
                  blankCorrect++;
                }
              }
              if (
                blankEntries.length > 0 &&
                blankCorrect === blankEntries.length
              ) {
                earned += pts;
              }
            }
            // ── OPEN — AI grading ──
            else if (
              sq.type === "OPEN" &&
              typeof wResp[sq.id] === "string" &&
              wResp[sq.id].trim().length > 0
            ) {
              try {
                const { requireAiCredits } =
                  await import("../services/ai-credits.js");
                await requireAiCredits(app.prisma, userId);

                const aiResult = await gradeOpenQuestion({
                  subjectSlug: question.subject.slug,
                  question: `${content.work ? `Lektura: ${content.work}.` : ""}${content.epochLabel ? ` Epoka: ${content.epochLabel}.` : ""}\n${content.context || ""}\n\nPytanie: ${sq.text}`,
                  rubric:
                    sq.rubric ||
                    sq.sampleAnswer ||
                    "Oceń merytoryczną poprawność i kompletność odpowiedzi. Odnieś się do treści lektury/materiału źródłowego.",
                  maxPoints: pts,
                  userAnswer: wResp[sq.id],
                  sampleAnswer: sq.sampleAnswer,
                  userId,
                  caller: "ai-grading-wiazka-open",
                });

                const sqEarned = Math.round(aiResult.score * pts);
                earned += sqEarned;
                wiazkaAiResults[sq.id] = {
                  score: aiResult.score,
                  pointsEarned: sqEarned,
                  feedback: aiResult.feedback,
                  correctAnswer: aiResult.correctAnswer,
                };
              } catch (creditErr: any) {
                console.error(
                  `[WIAZKA OPEN AI] sub=${sq.id} error:`,
                  creditErr.message || creditErr,
                );
                wiazkaAiResults[sq.id] = {
                  score: 0,
                  pointsEarned: 0,
                  feedback:
                    "Brak kredytów AI — odpowiedź nie została oceniona. Porównaj ze wzorcową odpowiedzią.",
                  correctAnswer: sq.sampleAnswer || null,
                };
              }
            } // ── OPEN — empty answer → 0 points ──
            else if (sq.type === "OPEN") {
              wiazkaAiResults[sq.id] = {
                score: 0,
                pointsEarned: 0,
                feedback: "Brak odpowiedzi.",
                correctAnswer: sq.sampleAnswer || null,
              };
            }
          }

          score = max > 0 ? earned / max : 0;
          isCorrect = earned === max;

          // Attach AI sub-grading results if any
          if (Object.keys(wiazkaAiResults).length > 0) {
            aiGrading = { subQuestions: wiazkaAiResults };
          }
          break;
        }
        case "DIAGRAM_LABEL": {
          const labels = content.labels as {
            id: string;
            question: string;
            acceptedAnswers: string[];
          }[];
          const userLabels = response as Record<string, string>;
          if (labels?.length) {
            let correct = 0;
            const labelAiResults: Record<string, any> = {};

            for (const label of labels) {
              const uv = (userLabels[label.id] || "").trim().toLowerCase();
              if (
                label.acceptedAnswers?.some(
                  (a: string) => a.toLowerCase().trim() === uv,
                )
              ) {
                correct++;
              } else if (uv.length > 0) {
                try {
                  const { requireAiCredits } =
                    await import("../services/ai-credits.js");
                  await requireAiCredits(app.prisma, userId);

                  const aiResult = await gradeOpenQuestion({
                    subjectSlug: question.subject.slug,
                    question: label.question,
                    rubric: `Wzorcowe odpowiedzi: ${label.acceptedAnswers.join(" / ")}. Uczeń wpisał: "${userLabels[label.id]}". Oceń czy jest merytorycznie równoważne (synonim, inna poprawna nazwa). Bądź LIBERALNY.`,
                    maxPoints: 1,
                    userAnswer: userLabels[label.id],
                    sampleAnswer: label.acceptedAnswers[0],
                    userId,
                    caller: "ai-grading-diagram-label",
                  });

                  if (aiResult.isCorrect || aiResult.score >= 0.5) correct++;
                  labelAiResults[label.id] = {
                    score: aiResult.score,
                    feedback: aiResult.feedback,
                  };
                } catch (err: any) {
                  console.error(
                    `[DIAGRAM_LABEL AI] label=${label.id} error:`,
                    err.message || err,
                  );
                  labelAiResults[label.id] = {
                    score: 0,
                    feedback: "Poprawna: " + label.acceptedAnswers[0],
                  };
                }
              }
            }

            score = correct / labels.length;
            isCorrect = score >= 1.0;
            if (Object.keys(labelAiResults).length > 0) {
              aiGrading = { labels: labelAiResults };
            }
          }
          break;
        }

        case "CALCULATION": {
          const expected = content.answer?.expectedValue;
          const tolerance = content.answer?.tolerance ?? 0;

          // Frontend sends { value: "5,04", steps: "..." } OR plain string
          let rawValue: string;
          if (
            typeof response === "object" &&
            response !== null &&
            !Array.isArray(response)
          ) {
            rawValue = String(response.value || "");
          } else {
            rawValue = String(response);
          }

          // Parse: handle Polish comma decimal, strip units/text
          const cleaned = rawValue
            .replace(/,/g, ".")
            .replace(/[^0-9.\-]/g, "")
            .trim();
          const userVal = parseFloat(cleaned);

          const stepsText =
            typeof response === "object" ? response.steps || "" : "";
          const deterministicMatch =
            expected != null &&
            !isNaN(userVal) &&
            (Math.abs(userVal - expected) <= tolerance ||
              !!content.answer?.acceptedValues?.some(
                (av: any) =>
                  Math.abs(parseFloat(String(av)) - userVal) <= 0.001,
              ));

          if (deterministicMatch) {
            isCorrect = true;
            score = 1.0;

            // AI feedback on steps when user wrote reasoning
            if (content.showSteps && stepsText.trim().length > 10) {
              try {
                const { requireAiCredits } =
                  await import("../services/ai-credits.js");
                await requireAiCredits(app.prisma, userId);

                const aiResult = await gradeOpenQuestion({
                  subjectSlug: question.subject.slug,
                  question: content.question || "",
                  rubric: `Poprawna odpowiedź: ${expected} ${content.answer?.unit || ""}. Uczeń podał POPRAWNY wynik: ${rawValue}. Oceń TOK ROZUMOWANIA — wskaż czy metoda jest poprawna, kroki logiczne, i daj konstruktywny feedback.`,
                  maxPoints: question.points,
                  userAnswer: `Obliczenia:\n${stepsText}\n\nWynik: ${rawValue}`,
                  sampleAnswer:
                    content.explanation ||
                    `${expected} ${content.answer?.unit || ""}`,
                  userId,
                  caller: "ai-grading-calculation-steps",
                });

                aiGrading = { feedback: aiResult.feedback };
              } catch (err: any) {
                console.error(
                  `[CALCULATION AI steps] error:`,
                  err.message || err,
                );
              }
            }
          } else if (rawValue.trim().length > 0) {
            // ── AI: user wrote something but no deterministic match ──
            try {
              const { requireAiCredits } =
                await import("../services/ai-credits.js");
              await requireAiCredits(app.prisma, userId);

              const aiResult = await gradeOpenQuestion({
                subjectSlug: question.subject.slug,
                question: content.question || "",
                rubric: `Poprawna odpowiedź: ${expected} ${content.answer?.unit || ""}${tolerance > 0 ? ` (±${tolerance})` : ""}. Akceptowane wartości: ${(content.answer?.acceptedValues || [expected]).join(", ")}. Uczeń podał wynik: "${rawValue}". Oceń czy wynik jest poprawny (może być inny zapis, zaokrąglenie, inna jednostka). ${stepsText.trim().length > 10 ? "Oceń też tok rozumowania." : ""}`,
                maxPoints: question.points,
                userAnswer:
                  stepsText.trim().length > 10
                    ? `Obliczenia:\n${stepsText}\n\nWynik: ${rawValue}`
                    : rawValue,
                sampleAnswer:
                  content.explanation ||
                  `${expected} ${content.answer?.unit || ""}`,
                userId,
                caller: "ai-grading-calculation",
              });

              isCorrect = aiResult.isCorrect;
              score = aiResult.score;
              aiGrading = {
                feedback: aiResult.feedback,
                correctAnswer: aiResult.correctAnswer,
              };
            } catch (err: any) {
              console.error(`[CALCULATION AI] error:`, err.message || err);
              isCorrect = false;
              score = 0;
            }
          } else {
            isCorrect = false;
            score = 0;
          }
          break;
        }

        case "CROSS_PUNNETT": {
          const punnettQs = content.questions as {
            id: string;
            label: string;
            acceptedAnswers: string[];
          }[];
          const userPunnett = response as Record<string, string>;
          if (punnettQs?.length) {
            let correct = 0;
            const punnettAiResults: Record<string, any> = {};

            for (const pq of punnettQs) {
              const uv = (userPunnett[pq.id] || "").trim().toLowerCase();
              if (
                pq.acceptedAnswers?.some(
                  (a: string) => a.toLowerCase().trim() === uv,
                )
              ) {
                correct++;
              } else if (uv.length > 0) {
                try {
                  const { requireAiCredits } =
                    await import("../services/ai-credits.js");
                  await requireAiCredits(app.prisma, userId);

                  const aiResult = await gradeOpenQuestion({
                    subjectSlug: question.subject.slug,
                    question: `${content.question || ""}\n${pq.label}`,
                    rubric: `Wzorcowe odpowiedzi: ${pq.acceptedAnswers.join(" / ")}. Uczeń wpisał: "${userPunnett[pq.id]}". Oceń merytorycznie. Bądź LIBERALNY z zapisem genotypów.`,
                    maxPoints: 1,
                    userAnswer: userPunnett[pq.id],
                    sampleAnswer: pq.acceptedAnswers[0],
                    userId,
                    caller: "ai-grading-cross-punnett",
                  });

                  if (aiResult.isCorrect || aiResult.score >= 0.5) correct++;
                  punnettAiResults[pq.id] = {
                    score: aiResult.score,
                    feedback: aiResult.feedback,
                  };
                } catch (err: any) {
                  console.error(
                    `[CROSS_PUNNETT AI] q=${pq.id} error:`,
                    err.message || err,
                  );
                  punnettAiResults[pq.id] = {
                    score: 0,
                    feedback: "Poprawna: " + pq.acceptedAnswers[0],
                  };
                }
              }
            }

            score = correct / punnettQs.length;
            isCorrect = score >= 1.0;
            if (Object.keys(punnettAiResults).length > 0) {
              aiGrading = { questions: punnettAiResults };
            }
          }
          break;
        }

        case "EXPERIMENT_DESIGN": {
          const fields = content.fields as {
            id: string;
            label: string;
            sampleAnswer?: string;
            rubric?: string;
            points?: number;
          }[];
          const userFields = response as Record<string, string>;
          if (fields?.length) {
            let totalPts = 0;
            let earnedPts = 0;
            const expAiResults: Record<string, any> = {};

            for (const field of fields) {
              const pts = field.points || 1;
              totalPts += pts;
              const userVal = (userFields[field.id] || "").trim();

              if (userVal.length > 0) {
                try {
                  const { requireAiCredits } =
                    await import("../services/ai-credits.js");
                  await requireAiCredits(app.prisma, userId);

                  const aiResult = await gradeOpenQuestion({
                    subjectSlug: question.subject.slug,
                    question: field.label,
                    rubric:
                      field.rubric ||
                      field.sampleAnswer ||
                      "Oceń merytoryczną poprawność odpowiedzi.",
                    maxPoints: pts,
                    userAnswer: userVal,
                    sampleAnswer: field.sampleAnswer,
                    userId,
                    caller: "ai-grading-experiment-design",
                  });

                  const fieldEarned = Math.round(aiResult.score * pts);
                  earnedPts += fieldEarned;
                  expAiResults[field.id] = {
                    score: aiResult.score,
                    pointsEarned: fieldEarned,
                    feedback: aiResult.feedback,
                    correctAnswer: aiResult.correctAnswer,
                  };
                } catch (err: any) {
                  console.error(
                    `[EXPERIMENT_DESIGN AI] field=${field.id} error:`,
                    err.message || err,
                  );
                  expAiResults[field.id] = {
                    score: 0,
                    pointsEarned: 0,
                    feedback:
                      "Brak kredytów AI — nie oceniono. Porównaj ze wzorcową odpowiedzią.",
                    correctAnswer: field.sampleAnswer || null,
                  };
                }
              }
            }

            score = totalPts > 0 ? earnedPts / totalPts : 0;
            isCorrect = earnedPts === totalPts;

            if (Object.keys(expAiResults).length > 0) {
              aiGrading = { fields: expAiResults };
            }
          }
          break;
        }

        case "OPEN": {
          // AI grading — check credits first
          const { requireAiCredits } =
            await import("../services/ai-credits.js");
          await requireAiCredits(app.prisma, userId);
          const result = await gradeOpenQuestion({
            subjectSlug: question.subject.slug,
            question: content.question,
            rubric: content.rubric,
            maxPoints: content.maxPoints,
            userAnswer: response as string,
            sampleAnswer: content.sampleAnswer,
            userId,
          });
          isCorrect = result.isCorrect;
          score = result.score;
          aiGrading = {
            feedback: result.feedback,
            correctAnswer: result.correctAnswer,
          };
          break;
        }
        // ESSAY is handled separately via /api/essays
      }

      // ── Calculate XP ─────────────────────────────────────────────────────
      const xp = calculateXp({
        questionType: question.type,
        isCorrect: isCorrect ?? false,
        score,
        difficulty: question.difficulty,
        currentStreak: user.currentStreak,
      });

      // ── Save answer ──────────────────────────────────────────────────────
      const answer = await app.prisma.answer.create({
        data: {
          user: { connect: { id: userId } },
          question: { connect: { id: questionId } },
          ...(sessionId ? { session: { connect: { id: sessionId } } } : {}),
          response,
          isCorrect,
          score,
          pointsEarned: question.points,
          xpEarned: xp || 0,
          aiGrading: aiGrading ?? Prisma.JsonNull,
          gradedAt: new Date(),
          timeSpentMs: timeSpentMs || null,
        },
      });

      // ── Update stats ─────────────────────────────────────────────────────
      await app.prisma.question.update({
        where: { id: questionId },
        data: {
          totalAttempts: { increment: 1 },
          ...(isCorrect ? { correctCount: { increment: 1 } } : {}),
        },
      });

      await app.prisma.subjectProgress.upsert({
        where: { userId_subjectId: { userId, subjectId: question.subjectId } },
        update: {
          questionsAnswered: { increment: 1 },
          ...(isCorrect ? { correctAnswers: { increment: 1 } } : {}),
        },
        create: {
          userId,
          subjectId: question.subjectId,
          questionsAnswered: 1,
          correctAnswers: isCorrect ? 1 : 0,
        },
      });

      // ── Session update ───────────────────────────────────────────────────
      if (sessionId) {
        await app.prisma.studySession.update({
          where: { id: sessionId },
          data: {
            questionsAnswered: { increment: 1 },
            ...(isCorrect ? { correctAnswers: { increment: 1 } } : {}),
            totalXpEarned: { increment: xp },
            totalTimeMs: { increment: timeSpentMs || 0 },
          },
        });
      }

      // ── Gamification pipeline ────────────────────────────────────────────
      const [xpResult, streakResult, diffResult] = await Promise.all([
        awardXp(app.prisma, userId, question.subjectId, xp),
        updateStreak(app.prisma, userId),
        updateAdaptiveDifficulty(
          app.prisma,
          userId,
          question.subjectId,
          question.difficulty,
          isCorrect ?? false,
        ),
      ]);

      // Spaced repetition — create/update review card
      await ensureReviewCard(app.prisma, userId, questionId, question.topicId);
      const quality = answerToQuality(isCorrect ?? false, score, timeSpentMs);

      const reviewCard = await app.prisma.reviewCard.findUnique({
        where: { userId_questionId: { userId, questionId } },
      });
      if (reviewCard) {
        await processReview(app.prisma, reviewCard.id, quality);
      }

      // Daily goal
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await app.prisma.dailyGoal.upsert({
        where: { userId_date: { userId, date: today } },
        update: {
          questionsCompleted: { increment: 1 },
          xpEarned: { increment: xp },
        },
        create: {
          userId,
          date: today,
          questionsCompleted: 1,
          xpEarned: xp,
        },
      });

      // Check achievements (async, non-blocking)
      const achievementResult = checkAchievements(app.prisma, userId).catch(
        () => ({ unlocked: [] }),
      );

      const achievements = await achievementResult;

      // ── Response ─────────────────────────────────────────────────────────
      return {
        answerId: answer.id,
        isCorrect,
        score,
        xpEarned: xp,
        aiGrading,
        explanation: question.explanation,
        correctAnswer: isCorrect
          ? null
          : getCorrectAnswer(question.type, content),

        // Gamification feedback
        gamification: {
          totalXp: xpResult.totalXp,
          globalLevel: xpResult.globalLevel,
          subjectXp: xpResult.subjectXp,
          subjectLevel: xpResult.subjectLevel,
          leveledUp: xpResult.leveledUp,
          streak: streakResult.currentStreak,
          isNewDay: streakResult.isNewDay,
          adaptiveDifficulty: diffResult,
          achievements: achievements.unlocked,
        },
      };
    },
  );
};

// ── Helper: extract correct answer for feedback ──────────────────────────

function getCorrectAnswer(type: string, content: Record<string, any>): any {
  switch (type) {
    case "CLOSED":
      return content.correctAnswer;
    case "MULTI_SELECT":
      return content.correctAnswers;
    case "TRUE_FALSE":
      return content.statements?.map((s: any) => s.isTrue);
    case "FILL_IN":
      return content.blanks?.map((b: any) => b.acceptedAnswers[0]);
    case "MATCHING":
      return content.pairs;
    case "ORDERING":
      return content.correctOrder;
    default:
      return null;
  }
}
