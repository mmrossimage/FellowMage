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
        // mesmo lugar da prévia do tabuleiro: centro da tela, sem capturar o mouse
        <motion.div
          key={ref.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center"
        >
          <CardArt card={{ name }} size="large" className="w-[min(320px,24vw,48vh)] shadow-[0_20px_60px_rgba(0,0,0,.8)]" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
