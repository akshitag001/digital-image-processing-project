import { useEffect, useState } from 'react';
import { termById } from '../data/terms';

interface Tip {
  id: string;
  left: number;
  top: number;
  above: boolean;
}

/**
 * One tooltip for the whole app. Any element carrying `data-term-id` shows the term name and one-line
 * definition on hover or keyboard focus (event delegation, so auto-linked prose needs no extra wiring).
 */
export function TooltipHost() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    const find = (t: EventTarget | null) => (t instanceof Element ? (t.closest('[data-term-id]') as HTMLElement | null) : null);
    const show = (el: HTMLElement) => {
      const id = el.dataset.termId;
      if (!id || !termById.has(id)) return;
      current = el;
      el.setAttribute('aria-describedby', 'term-tip');
      const r = el.getBoundingClientRect();
      const width = 320;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const above = r.bottom + 140 > window.innerHeight && r.top > 140;
      setTip({ id, left, top: above ? r.top - 6 : r.bottom + 6, above });
    };
    const hide = () => {
      current?.removeAttribute('aria-describedby');
      current = null;
      setTip(null);
    };
    const over = (e: Event) => {
      const el = find(e.target);
      if (el && el !== current) show(el);
    };
    const out = (e: Event) => {
      const el = find(e.target);
      const to = (e as MouseEvent).relatedTarget;
      if (el && !(to instanceof Node && el.contains(to))) hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('hashchange', hide);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('hashchange', hide);
    };
  }, []);

  if (!tip) return null;
  const term = termById.get(tip.id);
  if (!term) return null;
  return (
    <div
      id="term-tip"
      role="tooltip"
      className="term-tip"
      style={{ left: tip.left, top: tip.top, width: 320, transform: tip.above ? 'translateY(-100%)' : undefined }}
    >
      <div className="font-semibold">{term.name}</div>
      <div className="mt-0.5 text-slate-700 dark:text-slate-300">{term.shortDef}</div>
      <div className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">Click for notes</div>
    </div>
  );
}
