import { useEffect, useRef } from 'react';

export function MagiVideoPreview({
  src,
  poster,
  label,
  paused = false,
  onEnded,
  onError,
}: {
  src: string;
  poster?: string;
  label?: string;
  paused?: boolean;
  onEnded?: () => void;
  onError?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    const sync = () => {
      if (!inView || document.hidden || paused || reducedMotion.matches) {
        video.pause();
      } else {
        video.muted = true;
        void video.play().catch(() => {
          // The labeled controls or play button remain available.
        });
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.intersectionRatio >= 0.2;
        sync();
      },
      { threshold: 0.2 }
    );
    observer.observe(video);
    reducedMotion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);

    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      video.pause();
    };
  }, [src, paused]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      preload="none"
      muted
      loop={!onEnded}
      onEnded={onEnded}
      onError={onError}
      playsInline
      controls={!!label}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
