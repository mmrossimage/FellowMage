import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { findCard } from '../game/CardPreview';
import { useStore } from '../store';
import { CardArt } from './CardArt';

/**
 * Cartas citadas em textos (log, chats, pedidos do servidor): o XMage marca cada uma com object_id e
 * alternative_name, e o cliente oficial abre a carta ao passar o mouse. Aqui um único ouvinte no
 * documento trata todos os textos; se o objeto está no jogo, a prévia normal aparece, senão a imagem
 * vem pelo nome.
 */
export function CardRefPreview() {
  const ref = useStore((s) => s.hoveredRef);
  const game = useStore((s) => s.game);
  const prompt = useStore((s) => s.prompt);
  const setHoveredRef = useStore((s) => s.setHoveredRef);

  useEffect(() => {
    const target = (e: Event) => (e.target as Element | null)?.closest?.('[data-obj]') as HTMLElement | null;
    const over = (e: MouseEvent) => {
      const el = target(e);
      if (el) setHoveredRef({ id: el.dataset.obj!, name: el.dataset.card ?? '' });
    };
    const out = (e: MouseEvent) => {
      const el = target(e);
      if (el && !el.contains(e.relatedTarget as Node)) setHoveredRef(undefined);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
    };
  }, [setHoveredRef]);

  // objeto presente no jogo: o CardPreview do tabuleiro já mostra (com regras e marcadores)
  const inGame = !!ref && !!findCard(ref.id, game, prompt);
  const name = ref?.name.split(' // ')[0].trim();
  return (
    <AnimatePresence>
      {ref && !inGame && name && (
        <motion.aside
          key={ref.id}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none fixed left-4 top-[13%] z-[80] w-[min(280px,20vw,42vh)]"
        >
          <CardArt card={{ name }} size="large" className="shadow-[0_20px_60px_rgba(0,0,0,.8)]" />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
