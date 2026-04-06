import { useState, useEffect } from 'react';
import { subjects as subjectsApi, dashboard as dashboardApi } from '../../lib/api';

export function SubjectDetailPage({ slug }: { slug: string }) {
  const [subject, setSubject] = useState<any>(null);
  const [dashData, setDashData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      subjectsApi.get(slug),
      dashboardApi.subject(slug).catch(() => null),
    ])
      .then(([s, d]) => { setSubject(s); setDashData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />)}</div>;
  if (!subject) return <p>Przedmiot nie znaleziony.</p>;

  const progress = dashData?.progress;
  const topicBreakdown = dashData?.topicBreakdown || [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <span className="text-4xl">{subject.icon}</span>
        <div>
          <h1 className="font-display font-bold text-2xl">{subject.name}</h1>
          {subject.description && <p className="text-zinc-500 text-sm">{subject.description}</p>}
        </div>
      </div>

      {/* Progress summary */}
      {progress && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="font-display font-bold text-xl">{progress.level}</div>
            <div className="text-xs text-zinc-500">Poziom</div>
          </div>
          <div className="stat-card">
            <div className="font-display font-bold text-xl">{progress.xp}</div>
            <div className="text-xs text-zinc-500">XP</div>
          </div>
          <div className="stat-card">
            <div className="font-display font-bold text-xl">{progress.questionsAnswered}</div>
            <div className="text-xs text-zinc-500">Odpowiedzi</div>
          </div>
          <div className="stat-card">
            <div className="font-display font-bold text-xl">
              {progress.questionsAnswered > 0 ? Math.round((progress.correctAnswers / progress.questionsAnswered) * 100) : 0}%
            </div>
            <div className="text-xs text-zinc-500">Celność</div>
          </div>
        </div>
      )}

      {/* Quick action */}
      <div className="flex gap-3">
        <a href={`/dashboard/sesja`} className="btn-primary">Nowa sesja z {subject.name}</a>
      </div>

      {/* Topics */}
      <div>
        <h2 className="font-display font-bold text-lg mb-4">
          {subject.taxonomyType === 'EPOCH_WORK' ? 'Epoki i lektury' : 'Tematy'}
        </h2>
        <div className="space-y-3">
          {subject.topics?.filter((t: any) => t.depth === 0 || !t.parentId).map((topic: any) => {
            const stats = topicBreakdown.find((tb: any) => tb.topicId === topic.id);
            return (
              <div key={topic.id} className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-display font-semibold">{topic.name}</h3>
                    {topic.dateFrom && <span className="text-xs text-zinc-500">{topic.dateFrom} – {topic.dateTo}</span>}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium">{topic.questionCount} pytań</span>
                    {stats && <p className="text-xs text-zinc-500">{stats.avgScore || 0}% celność</p>}
                  </div>
                </div>

                {/* Children (e.g. lektury under epochs) */}
                {topic.children?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {topic.children.map((child: any) => (
                      <span key={child.id} className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-surface-800 text-xs font-medium">
                        {child.name}
                        {child.author && <span className="text-zinc-400 ml-1">({child.author})</span>}
                        <span className="text-zinc-400 ml-1">{child.questionCount}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
