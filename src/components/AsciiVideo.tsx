import { useEffect, useState } from "react";
import { sailingAsciiFrames } from "@/assets/sailingAsciiFrames";

interface AsciiVideoProps {
  className?: string;
  fps?: number;
}

const AsciiVideo = ({ className = "", fps = 24 }: AsciiVideoProps) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % sailingAsciiFrames.length);
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [fps]);

  return (
    <pre
      className={`font-mono text-[0.5rem] sm:text-[0.6rem] md:text-[0.7rem] lg:text-[0.8rem] leading-[1] whitespace-pre overflow-hidden select-none ${className}`}
      style={{
        fontFamily: "monospace",
      }}
    >
      {sailingAsciiFrames[frameIndex]}
    </pre>
  );
};

export default AsciiVideo;
