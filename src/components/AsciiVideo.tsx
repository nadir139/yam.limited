import { useEffect, useRef, useState } from "react";

interface AsciiVideoProps {
  className?: string;
  fps?: number;
}

/**
 * Frame data lives in `public/sailing-ascii.txt` (~2.6 MB, ~290 kB gzipped) rather
 * than in a module, so it never enters the JS bundle or blocks first paint. Frames
 * are `\x1e`-separated; that byte cannot appear in the art's character set.
 */
const FRAMES_URL = `${import.meta.env.BASE_URL}sailing-ascii.txt`;
const FRAME_SEPARATOR = "\x1e";

// Module-level cache so remounts (e.g. route changes) reuse the parsed frames.
let framesCache: string[] | null = null;
let framesRequest: Promise<string[]> | null = null;

function loadFrames(): Promise<string[]> {
  if (framesCache) return Promise.resolve(framesCache);
  if (!framesRequest) {
    framesRequest = fetch(FRAMES_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`ascii frames: HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        framesCache = text.split(FRAME_SEPARATOR);
        return framesCache;
      })
      .catch((err) => {
        framesRequest = null;
        throw err;
      });
  }
  return framesRequest;
}

const AsciiVideo = ({ className = "", fps = 24 }: AsciiVideoProps) => {
  const preRef = useRef<HTMLPreElement>(null);
  const [ready, setReady] = useState(framesCache !== null);

  useEffect(() => {
    let cancelled = false;
    loadFrames().then(
      () => {
        if (!cancelled) setReady(true);
      },
      () => {
        /* leave the empty placeholder in place if the asset can't be fetched */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = preRef.current;
    const frames = framesCache;
    if (!ready || !el || !frames?.length) return;

    // Paint frame 0 immediately so there is no gap before the first tick.
    el.textContent = frames[0];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const frameInterval = 1000 / fps;
    let rafId = 0;
    let lastTime = 0;
    let index = 0;
    let onScreen = true;

    // Writing textContent directly keeps a 24 fps animation over a ~18 kB text
    // node out of React's render path entirely.
    const tick = (time: number) => {
      rafId = requestAnimationFrame(tick);
      if (!onScreen || document.hidden) return;
      if (time - lastTime < frameInterval) return;
      lastTime = time;
      index = (index + 1) % frames.length;
      el.textContent = frames[index];
    };
    rafId = requestAnimationFrame(tick);

    // Don't burn frames while the hero is scrolled out of view.
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [ready, fps]);

  return (
    <pre
      ref={preRef}
      aria-hidden="true"
      className={`font-mono leading-none whitespace-pre select-none ${className}`}
      style={{
        fontSize: "clamp(0.22rem, 0.55vw, 0.7rem)",
        lineHeight: "1.1",
        letterSpacing: "-0.02em",
      }}
    />
  );
};

export default AsciiVideo;
