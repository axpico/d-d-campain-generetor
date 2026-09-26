import { useEffect, useState } from 'react';
import { imagesDb } from '../lib/storage';
import { generateImage, IMAGE_PROVIDERS } from '../ai/image';
import { useApp } from './context';

/** Resolve a stored image id into something an <img> can show. */
export function useImageUrl(id?: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let revoke: string | undefined;
    let alive = true;
    setUrl(undefined);
    if (id) {
      imagesDb.get(id).then((img) => {
        if (!alive || !img) return;
        if (img.url) setUrl(img.url);
        else if (img.blob) { revoke = URL.createObjectURL(img.blob); setUrl(revoke); }
      });
    }
    return () => { alive = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, [id]);
  return url;
}

export function ImageSlot({ imageId, prompt, onChange, wide, label = 'image', compact }: {
  imageId?: string;
  prompt: () => string;
  onChange: (id: string | undefined) => void;
  wide?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const { img, toast } = useApp();
  const url = useImageUrl(imageId);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);

  async function gen() {
    setBusy(true);
    try {
      const res = await generateImage(img, prompt(), { wide });
      if (imageId) imagesDb.delete(imageId);
      onChange(res.id);
    } catch (e) {
      toast(`Image generation failed (${IMAGE_PROVIDERS[img.provider].label}): ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (imageId) imagesDb.delete(imageId);
    onChange(undefined);
  }

  return (
    <div className={`image-slot ${wide ? 'wide' : ''} ${compact ? 'compact' : ''}`}>
      {url ? (
        <img src={url} alt={label} onClick={() => setZoom(true)} loading="lazy" />
      ) : (
        <div className="image-empty">{busy ? <span className="spinner" aria-label="Generating" /> : <span>No {label}</span>}</div>
      )}
      <div className="image-actions no-print">
        <button className="btn small" onClick={gen} disabled={busy}>{busy ? 'Painting…' : url ? '↻ New' : `🎨 Generate ${label}`}</button>
        {url && <button className="btn small ghost" onClick={remove} disabled={busy} title="Remove image">✕</button>}
      </div>
      {zoom && url && (
        <div className="lightbox" onClick={() => setZoom(false)} role="dialog" aria-label={label}>
          <img src={url} alt={label} />
        </div>
      )}
    </div>
  );
}
