import { useEffect, useState, useRef, memo } from "react";
import { sailingAsciiFrames } from "@/assets/sailingAsciiFrames";

interface AsciiVideoProps {
  className?: string;
  fps?: number;
}

const AsciiVideo = memo(({ className = "", fps = 24 }: AsciiVideoProps) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  const frameInterval = 1000 / fps;

  useEffect(() => {
    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined) {
        const deltaTime = time - previousTimeRef.current;
        if (deltaTime >= frameInterval) {
          setFrameIndex((prev) => (prev + 1) % sailingAsciiFrames.length);
          previousTimeRef.current = time;
        }
      } else {
        previousTimeRef.current = time;
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [frameInterval]);

  return (
    <pre
      className={`font-mono leading-none whitespace-pre select-none ${className}`}
      style={{
        fontSize: "clamp(0.22rem, 0.55vw, 0.7rem)",
        lineHeight: "1.1",
        letterSpacing: "-0.02em",
      }}
    >
      {sailingAsciiFrames[frameIndex]}
    </pre>
  );
});

AsciiVideo.displayName = "AsciiVideo";

export default AsciiVideo;
