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
 * Renderuje tekst mieszający prozę z wyrażeniami między $...$.
 * Dla tekstów pytań gdzie wzór jest wtopiony w zdanie:
 *   "Stała dysocjacji $\\ce{CH3COOH}$ wynosi $K_a = 1{,}8\\cdot10^{-5}$."
 */
export function ChemText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          return <InlineMath key={i} math={part.slice(1, -1)} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
