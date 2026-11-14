import { useEffect, useMemo, useRef, useState } from 'react';
import { demoById, demoGroups, demos, defaultParams } from '../demos';
import type { Demo, DemoResult, ParamDef } from '../demos/types';
import { fitSize, type CV, type Params, type RGBAImage } from '../cv/core';
import { sampleById, samples } from '../lib/samples';
import { hrefFor } from '../lib/router';
import { useOpenCV, type CvState } from '../lib/useOpenCV';
import { CvStatus } from '../components/CvStatus';
import { CodeBlock, ImageCanvas, LinkedText, TermChip } from '../components/basics';

const sampleCache = new Map<string, RGBAImage>();
const getSample = (id: string): RGBAImage => {
  let s = sampleCache.get(id);
  if (!s) {
    s = sampleById(id).make();
    sampleCache.set(id, s);
  }
  return s;
};

async function imageFromFile(file: File, max = 480): Promise<RGBAImage> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitSize(bmp.width, bmp.height, max);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const d = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

function ParamControl({ def, value, onChange }: { def: ParamDef; value: Params[string]; onChange: (v: number | string | boolean) => void }) {
  const id = `p-${def.key}`;
  if (def.type === 'range') {
    return (
      <div>
        <label htmlFor={id} className="flex justify-between text-sm font-medium">
          <span>{def.label}</span>
          <output htmlFor={id} className="tabular-nums text-indigo-700 dark:text-indigo-300">
            {Number(value)}
          </output>
        </label>
        <input id={id} type="range" min={def.min} max={def.max} step={def.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-indigo-600" />
      </div>
    );
  }
  if (def.type === 'select') {
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium">
          {def.label}
        </label>
        <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900">
          {def.options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
      <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
      {def.label}
    </label>
  );
}

function DemoPlayer({ demo, cvState }: { demo: Demo; cvState: CvState }) {
  const [params, setParams] = useState<Params>(() => defaultParams(demo));
  const [sampleId, setSampleId] = useState(demo.sample);
  const [upload, setUpload] = useState<{ name: string; image: RGBAImage } | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const src = upload?.image ?? getSample(sampleId);
  const cv: CV | null = cvState.status === 'ready' ? cvState.cv : null;

  useEffect(() => {
    if (!cv) return;
    let cancelled = false;
    setBusy(true);
    const handle = window.setTimeout(async () => {
      try {
        const r = await demo.run(cv, src, params);
        if (!cancelled) {
          setResult(r);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [cv, demo, src, params]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setUpload({ name: f.name, image: await imageFromFile(f) });
    } catch {
      setError('That file could not be read as an image.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <aside aria-label="Controls" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="text-sm font-semibold">Input image</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {samples.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.description}
                  aria-pressed={!upload && sampleId === s.id}
                  onClick={() => {
                    setUpload(null);
                    setSampleId(s.id);
                  }}
                  className={`rounded-md border px-2 py-1 text-xs font-medium ${!upload && sampleId === s.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="upload" onChange={(e) => onFile(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 w-full rounded-md border border-dashed border-slate-400 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
              {upload ? `Using: ${upload.name}` : 'Upload your own image...'}
            </button>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Stays in your browser; nothing is uploaded. Please use only images you own, and never someone else&apos;s biometrics.</p>
          </div>
          {demo.params.length > 0 && (
            <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Parameters</p>
                <button type="button" onClick={() => setParams(defaultParams(demo))} className="text-xs text-indigo-700 underline dark:text-indigo-300">
                  Reset
                </button>
              </div>
              {demo.params.map((p) => (
                <ParamControl key={p.key} def={p} value={params[p.key]} onChange={(v) => setParams((o) => ({ ...o, [p.key]: v }))} />
              ))}
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          {!cv && <CvStatus state={cvState} retry={() => location.reload()} />}
          {error && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100">
              {error}
            </div>
          )}
          <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy={busy}>
            <ImageCanvas image={src} label="Before (input)" />
            {result?.outputs.map((o) => (
              <ImageCanvas key={o.label} image={o.image} label={o.label} />
            ))}
            {busy && cv && <span role="status" className="absolute right-2 top-2 rounded bg-slate-900/80 px-2 py-0.5 text-xs text-white">Processing...</span>}
          </div>

          {result && (
            <>
              {result.stats && result.stats.length > 0 && (
                <dl className="grid gap-2 sm:grid-cols-2" aria-label="Measurements">
                  {result.stats.map((s) => (
                    <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                      <dt className="text-xs text-slate-600 dark:text-slate-400">{s.label}</dt>
                      <dd className="font-mono text-sm font-semibold">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <section aria-labelledby="what" className="rounded-lg border-l-4 border-indigo-500 bg-indigo-50 p-4 dark:bg-indigo-950/30">
                <h3 id="what" className="text-sm font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">
                  What you are seeing
                </h3>
                <p className="mt-1 leading-relaxed">
                  <LinkedText text={result.caption} />
                </p>
              </section>
              <section aria-labelledby="call">
                <h3 id="call" className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  The OpenCV call being run
                </h3>
                <CodeBlock code={result.call} label="OpenCV call" />
              </section>
            </>
          )}
        </div>
      </div>
      <section aria-labelledby="related">
        <h3 id="related" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Glossary terms for this demo
        </h3>
        <div className="flex flex-wrap gap-2">
          {demo.termIds.map((id) => (
            <TermChip key={id} id={id} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function PlaygroundPage({ demoId }: { demoId?: string }) {
  const cvState = useOpenCV();
  const demo = demoId ? demoById(demoId) : demos[0];
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return demoGroups;
    return demoGroups
      .map((g) => ({ ...g, demos: g.demos.filter((d) => (d.title + ' ' + d.summary + ' ' + g.name).toLowerCase().includes(q)) }))
      .filter((g) => g.demos.length);
  }, [filter]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Playground</h1>
        <p className="mt-1 max-w-3xl text-slate-700 dark:text-slate-300">
          {demos.length} live demos powered by OpenCV.js. Pick an image, move the sliders, and see before and after side by side together with the exact OpenCV call that produced the result.
        </p>
      </header>

      <nav aria-label="Demos" className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <label htmlFor="demo-filter" className="sr-only">
          Filter demos
        </label>
        <input id="demo-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter demos..." className="mb-3 w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900" />
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g.name}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">{g.name}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {g.demos.map((d) => (
                  <li key={d.id}>
                    <a
                      href={hrefFor.playground(d.id)}
                      aria-current={demo?.id === d.id ? 'page' : undefined}
                      className={`inline-block rounded-md border px-2 py-1 text-xs font-medium ${demo?.id === d.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
                    >
                      {d.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {!demo ? (
        <p role="alert">Unknown demo &quot;{demoId}&quot;. Choose one above.</p>
      ) : (
        <section aria-labelledby="demo-title">
          <h2 id="demo-title" className="text-2xl font-bold">
            {demo.title}
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-slate-700 dark:text-slate-300">
            <LinkedText text={demo.summary} />
          </p>
          <DemoPlayer key={demo.id} demo={demo} cvState={cvState} />
        </section>
      )}
    </div>
  );
}
