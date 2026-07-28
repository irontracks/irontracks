'use client';

/**
 * AutoloadNote — rodapé da sugestão de carga (🧠 explicação + 🔩 anilhas por lado).
 *
 * Existe para os 14 renderers de série NÃO divergirem: o bloco era copiado em 13
 * arquivos e qualquer adição (como a dica de anilhas) precisaria ser replicada
 * 13 vezes — que é exatamente como essa família acumula bug silencioso.
 */

export function AutoloadNote({
  show,
  rationale,
  plateHint,
  className = '',
}: {
  show: boolean;
  rationale: string;
  plateHint?: string;
  className?: string;
}) {
  if (!show) return null;
  if (!rationale && !plateHint) return null;
  return (
    <div className={`min-w-0 ${className}`}>
      {rationale ? (
        <div className="flex items-center gap-1 text-[10px] text-violet-300/80" title={rationale}>
          <span aria-hidden>🧠</span>
          <span className="truncate">{rationale}</span>
        </div>
      ) : null}
      {plateHint ? (
        <div className="flex items-center gap-1 text-[10px] text-neutral-400" title={`Montagem: ${plateHint}`}>
          <span aria-hidden>🔩</span>
          <span className="truncate">{plateHint}</span>
        </div>
      ) : null}
    </div>
  );
}
