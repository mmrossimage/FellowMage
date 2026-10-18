import { memo, useState } from 'react';
import { cardImageUrls, colorAccent, type ImageRef, type ImageSize } from '../cardImage';
import { cx } from '../util';

type Props = {
  card: ImageRef & { colors?: string[]; type?: string };
  size?: ImageSize;
  className?: string;
  /** recorte só da ilustração (fundo de cartões) */
  crop?: boolean;
};

/** Imagem de carta (Scryfall) com fallback por nome e um placeholder enquanto carrega. */
export const CardArt = memo(function CardArt({ card, size = 'normal', className, crop = false }: Props) {
  const urls = cardImageUrls(card, crop ? 'art_crop' : size);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // a mesma carta pode trocar de imagem (ex.: transformar): recomeça as tentativas
  const urlsKey = urls.join('|');
  const [shownKey, setShownKey] = useState(urlsKey);
  if (shownKey !== urlsKey) {
    setShownKey(urlsKey);
    setAttempt(0);
    setLoaded(false);
  }
  const src = urls[attempt];

  return (
    <div className={cx('relative overflow-hidden bg-ink-800', crop ? '' : 'aspect-[63/88] rounded-[6%/4.5%]', className)}>
      {!loaded && (
        <div className={cx('absolute inset-0 flex items-end bg-gradient-to-b p-[6%] text-[10px] font-semibold leading-tight text-black/80', colorAccent(card.colors ?? []))}>
          {!crop && <span className="line-clamp-2 rounded bg-white/70 px-1">{card.name}</span>}
        </div>
      )}
      {src && (
        <img
          key={src}
          src={src}
          alt={card.name}
          draggable={false}
          loading="lazy"
          className={cx('absolute inset-0 h-full w-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setAttempt((a) => a + 1);
          }}
        />
      )}
    </div>
  );
});

/** Pequenos círculos com as cores da identidade (W U B R G) usando os símbolos oficiais. */
export function IdentityPips({ identity, className }: { identity?: string[]; className?: string }) {
  const list = identity && identity.length ? identity : ['C'];
  return (
    <span className={cx('inline-flex gap-0.5', className)}>
      {list.map((c) => (
        <img key={c} src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} alt={c} className="h-4 w-4 drop-shadow" />
      ))}
    </span>
  );
}
