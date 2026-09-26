import ReelVideo from './ReelVideo'
import { capaDo, diaRotulo, videoDo, type Reel } from './reels'

/**
 * O reel em pé, com moldura e brilho. O texto fica EMBAIXO do vídeo, não por
 * cima: cada reel já traz o próprio título e o celular em 3D — cobrir a parte
 * de baixo escondia justamente a tela do app.
 */
export default function ReelCard({ reel, compacto = false }: { reel: Reel; compacto?: boolean }) {
  return (
    <div className="group">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] border border-white/10 bg-ink-2 transition duration-500 group-hover:-translate-y-1 group-hover:border-gold/40 group-hover:shadow-[0_24px_60px_-24px_rgba(245,184,0,0.55)]">
        <ReelVideo
          src={videoDo(reel.slug)}
          poster={capaDo(reel.slug)}
          label={`Vídeo: ${reel.titulo}`}
          className="h-full w-full object-cover"
        />
      </div>
      {!compacto && (
        <div className="mt-4 px-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold">{diaRotulo(reel.dia)}</p>
          <h3 className="mt-1 font-display text-xl font-bold leading-tight">{reel.titulo}</h3>
          <p className="mt-1.5 text-sm leading-snug text-white/70">{reel.resumo}</p>
        </div>
      )}
    </div>
  )
}
