import { useStore } from '../store';
import { resolveTableBg } from '../tableBg';

/**
 * Camadas atrás do tabuleiro: o fundo escolhido (tema ou arte de carta, com escurecer/desfocar) e,
 * por cima, o anel e a vinheta fixos da mesa. Fica dentro de um contêiner `isolate`, em -z.
 */
export function TableBackground() {
  const bg = useStore((s) => s.tableBg);
  const game = useStore((s) => s.game);
  const gameId = useStore((s) => s.gameId);
  const { css, art } = resolveTableBg(bg, game, gameId);
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: css }} />
      {art && (
        <div
          className="absolute -inset-6 bg-cover bg-center"
          // -inset: o desfoque escurece as bordas; a margem extra esconde isso
          style={{ backgroundImage: `url("${art}")`, filter: bg.blur ? `blur(${bg.blur}px)` : undefined }}
        />
      )}
      <div className="absolute inset-0 bg-black" style={{ opacity: bg.dim / 100 }} />
      <div className="table-overlay absolute inset-0" />
    </div>
  );
}
