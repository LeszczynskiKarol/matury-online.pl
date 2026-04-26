// frontend/src/components/quiz/Chem.tsx
// ============================================================================
// Renderer chemii / matematyki przez KaTeX + mhchem + code blocks.
// Obsługuje:
//   $\\ce{H2SO4}$  → KaTeX inline
//   `=SUMA(A1:A6)` → inline code
//   ```python\n...``` → fenced code block
// ============================================================================

import * as ReactKaTeXModule from "react-katex";
const ReactKaTeX = (ReactKaTeXModule as any).default || ReactKaTeXModule;
const { InlineMath, BlockMath } = ReactKaTeX;

/**
 * Prosty komponent renderujący pojedyncze wyrażenie KaTeX.
 */
export function Chem({
  children,
  block = false,
}: {
  children: string;
  block?: boolean;
}) {
  const src = children.trim();
  return block ? <BlockMath math={src} /> : <InlineMath math={src} />;
}

/**
 * Renderuje tekst mieszający prozę z:
 *   - ```lang\n...\n```  → fenced code block (ciemne tło, monospace)
 *   - $...$              → KaTeX inline math
 *   - `...`              → inline code (mono, różowe)
 *
 * Kolejność w regex ma znaczenie: fenced (3 backticki) MUSI być przed inline (1 backtick).
 */
export function ChemText({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```|\$[^$]+\$|`[^`]+`)/g);

  return (
    <>
      {parts.map((part, i) => {
        // ── Fenced code block ───────────────────────────────────────
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          // Odetnij opcjonalny język z pierwszej linii (python, js, etc.)
          const firstNl = inner.indexOf("\n");
          const code = firstNl >= 0 ? inner.slice(firstNl + 1) : inner;
          return (
            <pre
              key={i}
              className="my-3 p-4 rounded-xl bg-zinc-900 dark:bg-zinc-950 text-zinc-100 text-sm font-mono leading-relaxed overflow-x-auto"
            >
              <code>{code}</code>
            </pre>
          );
        }

        // ── LaTeX inline ────────────────────────────────────────────
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          return <InlineMath key={i} math={part.slice(1, -1)} />;
        }

        // ── Inline code ─────────────────────────────────────────────
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[0.85em] font-mono text-pink-600 dark:text-pink-400"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        // ── Zwykły tekst ────────────────────────────────────────────
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
