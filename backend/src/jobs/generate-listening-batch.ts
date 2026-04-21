// ============================================================================
// Generate Listening Questions — Full Pipeline: Claude → DB → TTS → S3
// npx tsx src/jobs/generate-listening-batch.ts --count=10 --level=PP
// npx tsx src/jobs/generate-listening-batch.ts --count=5 --level=PR --pattern=interview_mcq
// npx tsx src/jobs/generate-listening-batch.ts --count=1 --level=PP --topic="visiting a museum"
// ============================================================================

import { PrismaClient } from "@prisma/client";
import {
  generateListeningBatch,
  generateListeningQuestion,
  type Level,
  type ListeningPattern,
} from "../services/listening-generator.js";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) =>
    args
      .find((a) => a.startsWith(`--${name}=`))
      ?.split("=")
      .slice(1)
      .join("=");

  const count = parseInt(getArg("count") || "5");
  const level = (getArg("level") || "PP") as Level;
  const pattern = getArg("pattern") as ListeningPattern | undefined;
  const topic = getArg("topic");

  // Find English subject
  const subject = await prisma.subject.findUnique({
    where: { slug: "angielski" },
  });
  if (!subject) {
    console.error(
      "❌ Subject 'angielski' not found. Run the English seed first.",
    );
    process.exit(1);
  }

  // Find or create "Słuchanie" topic
  let listeningTopic = await prisma.topic.findFirst({
    where: { subjectId: subject.id, slug: "sluchanie" },
  });

  if (!listeningTopic) {
    listeningTopic = await prisma.topic.create({
      data: {
        subjectId: subject.id,
        slug: "sluchanie",
        name: "XIV. Rozumienie ze słuchu",
        sortOrder: 14,
        depth: 0,
        isActive: true,
      },
    });
    console.log("✅ Created topic: Rozumienie ze słuchu");
  }

  console.log(`\n🎧 Generating ${count} LISTENING questions (${level})\n`);
  console.log(`   Subject: ${subject.name} (${subject.id})`);
  console.log(`   Topic:   ${listeningTopic.name} (${listeningTopic.id})`);
  if (pattern) console.log(`   Pattern: ${pattern}`);
  if (topic) console.log(`   Topic:   ${topic}`);
  console.log("");

  if (count === 1 && (pattern || topic)) {
    // Single question mode
    const id = await generateListeningQuestion(prisma, {
      subjectId: subject.id,
      topicId: listeningTopic.id,
      pattern: pattern || "short_dialogue",
      level,
      topic,
    });
    console.log(`\n✅ Done: ${id}`);
  } else {
    // Batch mode
    const ids = await generateListeningBatch(prisma, {
      subjectId: subject.id,
      topicId: listeningTopic.id,
      level,
      count,
      patterns: pattern ? [pattern] : undefined,
      topics: topic ? [topic] : undefined,
    });
    console.log(`\n✅ Created ${ids.length} questions`);
  }

  // Stats
  const total = await prisma.question.count({
    where: { subjectId: subject.id, type: "LISTENING" },
  });
  const withAudio = await prisma.question.count({
    where: {
      subjectId: subject.id,
      type: "LISTENING",
      content: { path: ["audioUrl"], not: null as any },
    },
  });
  console.log(`\n📊 Total LISTENING: ${total} (${withAudio} with audio)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
