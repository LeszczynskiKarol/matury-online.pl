// ============================================================================
// Generate TTS Audio — CLI tool
// npx tsx src/jobs/generate-listening-audio.ts [--question-id=xxx] [--dry-run]
// ============================================================================

import { PrismaClient } from "@prisma/client";
import {
  generateListeningAudio,
  generateAllMissingAudio,
} from "../services/tts.service.js";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const questionId = args
    .find((a) => a.startsWith("--question-id="))
    ?.split("=")[1];
  const dryRun = args.includes("--dry-run");

  if (dryRun) {
    const questions = await prisma.question.findMany({
      where: { type: "LISTENING", isActive: true },
      select: { id: true, content: true },
    });
    const missing = questions.filter((q) => !(q.content as any).audioUrl);
    console.log(
      `📊 Listening questions: ${questions.length} total, ${missing.length} missing audio`,
    );
    for (const q of missing) {
      const c = q.content as any;
      console.log(
        `  - ${q.id}: ${c.listeningType} (${c.segments?.length || 0} segments)`,
      );
    }
    return;
  }

  if (questionId) {
    console.log(`🎙 Generating audio for single question: ${questionId}`);
    const url = await generateListeningAudio(prisma, questionId);
    console.log(`✅ Done: ${url}`);
  } else {
    console.log("🎙 Generating audio for ALL missing listening questions...\n");
    const count = await generateAllMissingAudio(prisma);
    console.log(`\n🎉 Done: ${count} audio files generated`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
