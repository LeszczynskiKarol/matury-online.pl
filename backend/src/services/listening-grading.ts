// ============================================================================
// Grading Logic for LISTENING questions
// backend/src/services/listening-grading.ts
// ============================================================================

interface ListeningGradingResult {
  isCorrect: boolean;
  score: number;
  pointsEarned: number;
  maxPoints: number;
  details: Record<string, { correct: boolean; earned: number; max: number }>;
}

export function gradeListeningQuestion(
  content: { subQuestions: any[] },
  response: Record<string, any>,
): ListeningGradingResult {
  const subQuestions = (content.subQuestions || []).map(
    (sq: any, i: number) => ({
      ...sq,
      id: String(sq.id || String.fromCharCode(97 + i)),
      text: sq.text || sq.question || "",
      type:
        sq.type ||
        (sq.options
          ? "CLOSED"
          : sq.statements
            ? "TRUE_FALSE"
            : sq.acceptedAnswers
              ? "FILL_IN"
              : "OPEN"),
      points: sq.points || 1,
      correctAnswer: sq.correctAnswer,
      options: sq.options?.map((o: any) => ({
        id: o.id || o.letter,
        text: o.text,
      })),
    }),
  );

  let totalEarned = 0;
  let totalMax = 0;
  const details: Record<
    string,
    { correct: boolean; earned: number; max: number }
  > = {};

  for (const sq of subQuestions) {
    const userAnswer = response[sq.id];
    let earned = 0;

    switch (sq.type) {
      case "CLOSED": {
        if (userAnswer === sq.correctAnswer) earned = sq.points;
        break;
      }
      case "TRUE_FALSE": {
        if (sq.statements && Array.isArray(userAnswer)) {
          const allCorrect = sq.statements.every(
            (st: any, i: number) => userAnswer[i] === st.isTrue,
          );
          if (allCorrect) earned = sq.points;
        }
        break;
      }
      case "FILL_IN": {
        if (sq.acceptedAnswers && typeof userAnswer === "string") {
          const norm = userAnswer.toLowerCase().trim();
          if (
            sq.acceptedAnswers.some(
              (a: string) => a.toLowerCase().trim() === norm,
            )
          ) {
            earned = sq.points;
          }
        }
        break;
      }
      case "OPEN": {
        if (sq.acceptedAnswers && typeof userAnswer === "string") {
          const norm = userAnswer.toLowerCase().trim();
          if (
            sq.acceptedAnswers.some((a: string) =>
              norm.includes(a.toLowerCase().trim()),
            )
          ) {
            earned = sq.points;
          }
        }
        break;
      }
    }

    details[sq.id] = { correct: earned > 0, earned, max: sq.points };
    totalEarned += earned;
    totalMax += sq.points;
  }

  return {
    isCorrect: totalEarned === totalMax,
    score: totalMax > 0 ? totalEarned / totalMax : 0,
    pointsEarned: totalEarned,
    maxPoints: totalMax,
    details,
  };
}
