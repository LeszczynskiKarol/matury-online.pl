// frontend/src/components/quiz/Chem.tsx
// ============================================================================
// Renderer chemii / matematyki przez KaTeX + mhchem.
// Użycie w seedach:
//   question: "W reakcji $\\ce{H2SO4}$ z $\\ce{NaOH}$ powstaje..."
//   lub przez dedykowane pole: chemEquation: "\\ce{H2 + O2 -> H2O}"
// ============================================================================

import { InlineMath, BlockMath } from "react-katex";

/**
 * Prosty komponent renderujący pojedyncze wyrażenie KaTeX.
 * Jeśli zawartość nie zaczyna się od \ce, NIE owijamy — pozwalamy na zwykłe
 * LaTeX-owe wyrażenia matematyczne (pH = -\log[H^+]).
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
 * Renderuje tekst mieszający prozę z wyrażeniami między $...$ (LaTeX)
 * oraz `...` (inline code, np. =LICZ.JEŻELI()).
 */
export function ChemText({ text }: { text: string }) {
  // Split łapie zarówno $...$ (LaTeX) jak i `...` (inline code)
  const parts = text.split(/(\$[^$]+\$|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          return <InlineMath key={i} math={part.slice(1, -1)} />;
        }
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
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
