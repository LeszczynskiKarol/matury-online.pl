// ============================================================================
// Listening topic helper — creates/fetches the listening topic for a subject
// Currently only angielski supports LISTENING. Guard here to avoid creating
// dangling topics in subjects where listening isn't part of the taxonomy.
// backend/src/services/listening-topic.ts
// ============================================================================

import { PrismaClient } from "@prisma/client";

// Map: subject slug → listening topic config
const LISTENING_TOPIC_CONFIG: Record<
  string,
  { slug: string; name: string; sortOrder: number } | undefined
> = {
  angielski: {
    slug: "sluchanie",
    name: "XIV. Rozumienie ze słuchu",
    sortOrder: 14,
  },
  // Future-proof: add other languages here when needed
  // niemiecki: { slug: "horverstehen", name: "...", sortOrder: 14 },
};

/**
 * Get or create the listening topic for a subject.
 * Returns null if the subject doesn't support listening.
 */
export async function ensureListeningTopic(
  prisma: PrismaClient,
  subjectId: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { slug: true },
  });
  if (!subject) return null;

  const config = LISTENING_TOPIC_CONFIG[subject.slug];
  if (!config) return null;

  let topic = await prisma.topic.findFirst({
    where: { subjectId, slug: config.slug },
    select: { id: true, name: true, slug: true },
  });

  if (!topic) {
    topic = await prisma.topic.create({
      data: {
        subjectId,
        slug: config.slug,
        name: config.name,
        sortOrder: config.sortOrder,
        depth: 0,
        isActive: true,
      },
      select: { id: true, name: true, slug: true },
    });
  }

  return topic;
}
