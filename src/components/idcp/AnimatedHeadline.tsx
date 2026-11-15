import { useEffect, useRef, useState } from "react";

export function AnimatedHeadline({
  text,
  className = "",
  delay = 0,
  as: Tag = "h1",
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: "h1" | "h2" | "h3";
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const words = text.split(" ");
  let charIdx = 0;

  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {words.map((word, wi) => (
        <span key={wi} className="inline-block whitespace-nowrap" aria-hidden>
          {Array.from(word).map((ch) => {
            const i = charIdx++;
            return (
              <span
                key={i}
                className="inline-block"
                style={{
                  animation: show ? `idcp-letter-in 0.7s cubic-bezier(0.2,0.8,0.2,1) both` : "none",
                  animationDelay: `${delay + i * 35}ms`,
                  opacity: show ? undefined : 0,
                }}
              >
                {ch}
              </span>
            );
          })}
          {wi < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </Tag>
  );
}
