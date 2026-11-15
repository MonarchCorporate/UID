import { useCallback, useEffect, useRef, useState } from "react";

/** Was gerade gezogen wird: ein bestehender Block oder ein neues Element. */
export type DragPayload =
  | { kind: "move"; path: number[]; label: string }
  | { kind: "new"; blockType: string; columns?: number; widths?: number[]; label: string };

/** Zielposition: Blockliste (Elternpfad) + Index darin. */
export type DropTarget = { parent: number[]; index: number };

type Options = {
  /** Bestehenden Block an eine andere Stelle im Baum verschieben. */
  onMove: (from: number[], to: DropTarget) => void;
  /** Neues Element an Position einfügen. */
  onInsert: (blockType: string, to: DropTarget, columns?: number, widths?: number[]) => void;
  /** Darf hier abgelegt werden? (z. B. Tiefenlimit für Container) */
  canDrop?: (payload: DragPayload, to: DropTarget) => boolean;
};

const key = (parent: number[]) => parent.join(".");

/**
 * Pointer-basiertes Drag & Drop für den Landingpage-Builder.
 *
 * Bewusst kein HTML5-Drag-&-Drop: das kollidiert mit Bildern, Textauswahl und
 * Klick-zum-Auswählen im Canvas und liefert in skalierten Vorschaubreiten
 * ungenaue Positionen. Pointer-Events funktionieren zusätzlich mit Touch.
 */
export function useCanvasDnd({ onMove, onInsert, canDrop }: Options) {
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const dragRef = useRef<DragPayload | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const cancelled = useRef(false);
  const moved = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const items = useRef(new Map<string, HTMLElement>());
  const zones = useRef(new Map<string, HTMLElement>());
  const scrollerRef = useRef<HTMLElement | null>(null);

  const setItemRef = useCallback(
    (parent: number[], index: number) => (el: HTMLElement | null) => {
      const k = `${key(parent)}#${index}`;
      if (el) items.current.set(k, el);
      else items.current.delete(k);
    },
    [],
  );

  /** Registriert eine Ablagefläche (Seitenebene oder Container-Spalte). */
  const setZoneRef = useCallback(
    (parent: number[]) => (el: HTMLElement | null) => {
      const k = key(parent);
      if (el) zones.current.set(k, el);
      else zones.current.delete(k);
    },
    [],
  );

  const computeDrop = useCallback((x: number, y: number): DropTarget => {
    // Tiefste Zone wählen, die den Zeiger enthält – so landet man in Spalten.
    let best: { parent: number[]; depth: number } | null = null;
    for (const [k, el] of zones.current) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const parent = k === "" ? [] : k.split(".").map(Number);
      if (!best || parent.length > best.depth) best = { parent, depth: parent.length };
    }
    const parent = best?.parent ?? [];
    const prefix = `${key(parent)}#`;
    const entries = [...items.current.entries()]
      .filter(([k, el]) => k.startsWith(prefix) && el.isConnected)
      .map(([k, el]) => [Number(k.slice(prefix.length)), el] as const)
      .sort((a, b) => a[0] - b[0]);
    if (entries.length === 0) return { parent, index: 0 };
    for (const [index, el] of entries) {
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) return { parent, index };
    }
    return { parent, index: entries[entries.length - 1][0] + 1 };
  }, []);

  const finish = useCallback(
    (commit: boolean) => {
      const payload = dragRef.current;
      const at = dropRef.current;
      dragRef.current = null;
      dropRef.current = null;
      setDrag(null);
      setDrop(null);
      setPointer(null);
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      document.body.style.userSelect = "";
      if (!commit || !payload || at === null) return;
      if (canDrop && !canDrop(payload, at)) return;
      if (payload.kind === "move") onMove(payload.path, at);
      else onInsert(payload.blockType, at, payload.columns, payload.widths);
    },
    [canDrop, onInsert, onMove],
  );

  /** Startet einen Drag – am Handle eines Blocks oder an einem Bibliothekseintrag. */
  const begin = useCallback(
    (e: React.PointerEvent, payload: DragPayload) => {
      e.preventDefault();
      e.stopPropagation();
      cancelled.current = false;
      moved.current = false;
      startPos.current = { x: e.clientX, y: e.clientY };
      dragRef.current = payload;
      posRef.current = { x: e.clientX, y: e.clientY };
      setDrag(payload);
      setPointer({ x: e.clientX, y: e.clientY });
      const at = computeDrop(e.clientX, e.clientY);
      dropRef.current = at;
      setDrop(at);
      document.body.style.userSelect = "none";
    },
    [computeDrop],
  );

  useEffect(() => {
    if (!drag) return;

    const onMoveEvt = (e: PointerEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      if (
        Math.abs(e.clientX - startPos.current.x) > 4 ||
        Math.abs(e.clientY - startPos.current.y) > 4
      )
        moved.current = true;
      setPointer({ x: e.clientX, y: e.clientY });
      const at = computeDrop(e.clientX, e.clientY);
      const cur = dropRef.current;
      if (!cur || cur.index !== at.index || key(cur.parent) !== key(at.parent)) {
        dropRef.current = at;
        setDrop(at);
      }
    };
    // Ohne Bewegung war es ein Klick (z. B. Bibliothekseintrag) – nichts einfügen.
    const onUp = () => finish(!cancelled.current && moved.current);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelled.current = true;
        finish(false);
      }
    };

    // Auto-Scroll, wenn der Zeiger an den Rand des Canvas kommt.
    const tick = () => {
      const el = scrollerRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const y = posRef.current.y;
        const zone = 70;
        if (y < r.top + zone) el.scrollTop -= Math.max(4, (r.top + zone - y) / 3);
        else if (y > r.bottom - zone) el.scrollTop += Math.max(4, (y - (r.bottom - zone)) / 3);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMoveEvt, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMoveEvt);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [drag, computeDrop, finish]);

  return { drag, drop, pointer, begin, setItemRef, setZoneRef, scrollerRef };
}
