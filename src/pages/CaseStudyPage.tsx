import { useEffect, useMemo, useRef, useState } from 'react';
import { fingerprintImage } from '../lib/samples';
import { defaultRidgeOptions, exposureFromPprp, matchMinutiae, runRidgePipeline, type RidgeOptions, type RidgeResult, type Stage } from '../cv/ridge';
import { useOpenCV } from '../lib/useOpenCV';
import { CvStatus } from '../components/CvStatus';
import { CodeBlock, ImageCanvas, LinkedText, TermChip } from '../components/basics';
import { hrefFor } from '../lib/router';
import type { CV } from '../cv/core';

const DISCLAIMER = 'GATTACA is a privacy-awareness tool. It estimates exposure risk; it does not store biometrics or defeat security systems.';

const UNIT_MAP: Array<[string, string, string]> = [
  ['1. Grayscale + simulated distance', 'Unit 1: Fundamentals (sampling, resolution)', 'u1'],
  ['2. CLAHE', 'Unit 4: Histogram processing', 'u4'],
  ['3. Bilateral denoise', 'Unit 5: Spatial filtering / Unit 7: Restoration', 'u5'],
  ['4. PPRP from the spectrum', 'Unit 6: Frequency domain + Unit 1 (Nyquist)', 'u6'],
  ['5. Orientation field', 'Unit 5: Gradients (Sobel) + smoothing', 'u5'],
  ['6. Gabor enhancement', 'Unit 14: Texture (Gabor) / Unit 6: Band-pass', 'u14'],
  ['7. Otsu / adaptive threshold', 'Unit 11: Segmentation', 'u11'],
  ['8. Thinning', 'Unit 10: Morphology', 'u10'],
  ['9. Minutiae', 'Unit 2: 8-neighborhood + Unit 17: Biometrics', 'u17'],
];

const levelStyle: Record<string, string> = {
  none: 'border-slate-400 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
  low: 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100',
  partial: 'border-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100',
  high: 'border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100',
};

function StageCard({ s }: { s: Stage }) {
  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-lg font-bold">{s.title}</h3>
      <div className="mt-2">
        <ImageCanvas image={s.image} label={s.title} />
      </div>
      <p className="mt-3 text-sm leading-relaxed">
        <LinkedText text={s.blurb} />
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.termIds.map((id) => (
          <TermChip key={id} id={id} />
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-indigo-700 dark:text-indigo-300">OpenCV call</summary>
        <div className="mt-2">
          <CodeBlock code={s.call} label={`${s.title} code`} />
        </div>
      </details>
    </article>
  );
}

interface SweepPoint {
  downscale: number;
  pprp: number;
  recovered: number;
  spurious: number;
  found: number;
}

function SweepChart({ points }: { points: SweepPoint[] }) {
  const W = 600;
  const H = 280;
  const m = { l: 48, r: 16, t: 14, b: 44 };
  const xs = points.map((p) => p.pprp);
  const xmin = Math.max(1.5, Math.floor(Math.min(...xs) * 2) / 2 - 0.5);
  const xmax = Math.ceil(Math.max(...xs)) + 0.5;
  const X = (v: number) => m.l + ((v - xmin) / (xmax - xmin)) * (W - m.l - m.r);
  const Y = (v: number) => m.t + (1 - v) * (H - m.t - m.b);
  const sorted = [...points].sort((a, b) => a.pprp - b.pprp);
  const path = sorted.map((p, i) => `${i ? 'L' : 'M'}${X(p.pprp).toFixed(1)},${Y(p.recovered).toFixed(1)}`).join(' ');
  const marks: Array<[number, string]> = [[2, 'Nyquist: 2'], [2.9, '2.9'], [3.9, '3.9']];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="sweep-title sweep-desc" className="h-auto w-full">
      <title id="sweep-title">Share of reference minutiae recovered versus pixels per ridge period</title>
      <desc id="sweep-desc">
        {sorted.map((p) => `PPRP ${p.pprp.toFixed(1)}: ${(p.recovered * 100).toFixed(0)}% recovered, ${p.spurious} spurious`).join('; ')}
      </desc>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} className="stroke-slate-200 dark:stroke-slate-700" />
          <text x={m.l - 6} y={Y(v) + 4} textAnchor="end" className="fill-slate-600 text-[11px] dark:fill-slate-400">
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {Array.from({ length: Math.floor(xmax - xmin) + 1 }, (_, i) => Math.ceil(xmin) + i)
        .filter((v) => v <= xmax)
        .map((v) => (
          <text key={v} x={X(v)} y={H - m.b + 16} textAnchor="middle" className="fill-slate-600 text-[11px] dark:fill-slate-400">
            {v}
          </text>
        ))}
      {marks.map(([v, label]) =>
        v >= xmin && v <= xmax ? (
          <g key={v}>
            <line x1={X(v)} x2={X(v)} y1={m.t} y2={H - m.b} strokeDasharray="4 4" className="stroke-slate-500" />
            <text x={X(v) + 3} y={m.t + 11} className="fill-slate-700 text-[10px] dark:fill-slate-300">
              {label}
            </text>
          </g>
        ) : null,
      )}
      <path d={path} fill="none" strokeWidth={2.5} className="stroke-indigo-600 dark:stroke-indigo-400" />
      {sorted.map((p) => (
        <circle key={p.downscale} cx={X(p.pprp)} cy={Y(p.recovered)} r={4} className="fill-indigo-600 stroke-white dark:fill-indigo-400 dark:stroke-slate-900" />
      ))}
      <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="fill-slate-800 text-[12px] dark:fill-slate-200">
        Pixels per ridge period (PPRP)
      </text>
      <text transform={`translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="fill-slate-800 text-[12px] dark:fill-slate-200">
        Reference minutiae recovered
      </text>
    </svg>
  );
}

export function CaseStudyPage() {
  const cvState = useOpenCV();
  const cv: CV | null = cvState.status === 'ready' ? cvState.cv : null;
  const [opts, setOpts] = useState<RidgeOptions>({ ...defaultRidgeOptions });
  const [result, setResult] = useState<RidgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sweep, setSweep] = useState<SweepPoint[] | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const sample = useMemo(() => fingerprintImage(), []);
  const baselines = useRef(new Map<string, RidgeResult>());

  const baseline = (c: CV, o: RidgeOptions): RidgeResult => {
    const key = `${o.threshold}|${o.darkRidges}|${o.claheClip}`;
    let b = baselines.current.get(key);
    if (!b) {
      b = runRidgePipeline(c, sample, { ...o, downscale: 1, noise: 0 });
      baselines.current.set(key, b);
    }
    return b;
  };

  useEffect(() => {
    if (!cv) return;
    let cancelled = false;
    setBusy(true);
    const h = window.setTimeout(() => {
      try {
        const r = runRidgePipeline(cv, sample, opts);
        if (!cancelled) {
          setResult(r);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(h);
    };
  }, [cv, opts, sample]);

  const match = useMemo(() => {
    if (!cv || !result) return null;
    const b = baseline(cv, opts);
    return { base: b, ...matchMinutiae(b.minutiae, result.minutiae, 1.5 * b.pprp) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv, result, opts]);

  const runSweep = () => {
    if (!cv) return;
    setSweeping(true);
    window.setTimeout(() => {
      try {
        const b = baseline(cv, opts);
        const pts: SweepPoint[] = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6].map((d) => {
          const r = runRidgePipeline(cv, sample, { ...opts, downscale: d });
          const m = matchMinutiae(b.minutiae, r.minutiae, 1.5 * b.pprp);
          return { downscale: d, pprp: r.pprp, recovered: m.recovered, spurious: m.spurious, found: r.minutiae.length };
        });
        setSweep(pts);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSweeping(false);
      }
    }, 30);
  };

  // the sweep is only valid for the settings it was run with
  useEffect(() => setSweep(null), [opts.noise, opts.threshold, opts.darkRidges, opts.claheClip]);

  const exposure = result ? result.exposure : exposureFromPprp(NaN);
  const set = (patch: Partial<RidgeOptions>) => setOpts((o) => ({ ...o, ...patch }));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Case study</p>
        <h1 className="text-3xl font-extrabold tracking-tight">GATTACA as a DIP pipeline</h1>
        <p className="mt-2 max-w-3xl leading-relaxed text-slate-800 dark:text-slate-200">
          GATTACA was built for the OpenCV AI Competition 2026. It asks one privacy question: <em>how much fingerprint ridge detail does a photo of your own hand give away?</em> It answers by running a classical image-processing pipeline and
          measuring how many ridges survive. Every stage below is an ordinary technique from this course. Click any term to open its notes.
        </p>
        <p className="mt-3 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm dark:border-slate-700 dark:bg-slate-800" role="note">
          <strong>{DISCLAIMER}</strong>
        </p>
      </header>

      <section aria-labelledby="ethics" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
        <h2 id="ethics" className="font-bold">
          Ethics note
        </h2>
        <p className="mt-1 text-sm leading-relaxed">
          This page is for education and privacy awareness only. It uses a <strong>procedurally generated ridge pattern</strong> (maths, not a person), so no real biometric data is involved. Nothing is uploaded, stored or logged: everything runs in
          your browser. The output is an educational exposure estimate, not a template for matching or spoofing any device. The original project follows the same rule: your own hand, with consent, deleted after scoring.
        </p>
      </section>

      <section aria-labelledby="nyq" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="nyq" className="text-xl font-bold">
          The key idea: pixels per ridge period (PPRP)
        </h2>
        <p className="mt-2 max-w-3xl leading-relaxed">
          Distance in metres means nothing without the lens, the sensor and any later resizing. What physically decides whether ridges can be recovered is{' '}
          <TermLinkInline id="pprp">how many pixels span one ridge-to-ridge period</TermLinkInline>. Ridges repeat every roughly 0.4-0.5 mm [TODO: verify against a cited source], so the question is a{' '}
          <TermLinkInline id="sampling">sampling</TermLinkInline> question. By the <TermLinkInline id="nyquist-criterion">Nyquist criterion</TermLinkInline> you need more than 2 samples per period; below that, <TermLinkInline id="aliasing">aliasing</TermLinkInline>{' '}
          makes the pattern unrecoverable no matter how clever the later steps are. Use the controls to move the &quot;camera&quot; away and watch PPRP fall.
        </p>
      </section>

      <section aria-labelledby="controls" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="controls" className="text-lg font-bold">
          Controls
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label htmlFor="cs-dist" className="flex justify-between text-sm font-medium">
              <span>Simulated distance (image shrunk by)</span>
              <output htmlFor="cs-dist" className="tabular-nums text-indigo-700 dark:text-indigo-300">
                {opts.downscale}x
              </output>
            </label>
            <input id="cs-dist" type="range" min={1} max={8} step={0.25} value={opts.downscale} onChange={(e) => set({ downscale: Number(e.target.value) })} className="mt-1 w-full accent-indigo-600" />
          </div>
          <div>
            <label htmlFor="cs-noise" className="flex justify-between text-sm font-medium">
              <span>Sensor noise sigma</span>
              <output htmlFor="cs-noise" className="tabular-nums text-indigo-700 dark:text-indigo-300">
                {opts.noise}
              </output>
            </label>
            <input id="cs-noise" type="range" min={0} max={30} step={1} value={opts.noise} onChange={(e) => set({ noise: Number(e.target.value) })} className="mt-1 w-full accent-indigo-600" />
          </div>
          <div>
            <label htmlFor="cs-thr" className="block text-sm font-medium">
              Binarization
            </label>
            <select id="cs-thr" value={opts.threshold} onChange={(e) => set({ threshold: e.target.value as RidgeOptions['threshold'] })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="otsu">Otsu</option>
              <option value="adaptive">Adaptive</option>
            </select>
          </div>
          <div>
            <label htmlFor="cs-clahe" className="flex justify-between text-sm font-medium">
              <span>CLAHE clip limit</span>
              <output htmlFor="cs-clahe" className="tabular-nums text-indigo-700 dark:text-indigo-300">
                {opts.claheClip}
              </output>
            </label>
            <input id="cs-clahe" type="range" min={1} max={8} step={0.5} value={opts.claheClip} onChange={(e) => set({ claheClip: Number(e.target.value) })} className="mt-1 w-full accent-indigo-600" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <button type="button" onClick={() => setOpts({ ...defaultRidgeOptions })} className="text-sm text-indigo-700 underline dark:text-indigo-300">
            Reset
          </button>
          {busy && <span role="status" className="text-sm text-slate-600 dark:text-slate-400">Processing...</span>}
        </div>
      </section>

      {!cv && <CvStatus state={cvState} retry={() => location.reload()} />}
      {error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </div>
      )}

      {result && (
        <section aria-labelledby="summary" className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <h2 id="summary" className="sr-only">
            Result summary
          </h2>
          <div className={`rounded-xl border-2 p-5 ${levelStyle[exposure.level]}`}>
            <p className="text-xs font-bold uppercase tracking-wide">Indicative exposure from PPRP</p>
            <p className="mt-1 text-2xl font-extrabold">{exposure.label}</p>
            <p className="mt-1 text-sm leading-relaxed">{exposure.detail}</p>
            <p className="mt-3 text-xs opacity-90">
              Thresholds come from GATTACA&apos;s own synthetic-print study (95% identification down to about 3.9 PPRP, 50% near 2.9). They are not a claim about real people or devices.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {[
              ['PPRP (measured)', `${result.pprp.toFixed(2)} px`],
              ['Image size', `${result.width} x ${result.height}`],
              ['Ridge-flow coverage', `${Math.round(result.coverage * 100)}%`],
              ['Endings / bifurcations', `${result.endings} / ${result.bifurcations}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <dt className="text-xs text-slate-600 dark:text-slate-400">{k}</dt>
                <dd className="text-lg font-bold tabular-nums">{v}</dd>
              </div>
            ))}
            {match && (
              <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-3 sm:col-span-4 lg:col-span-2 xl:col-span-4 dark:border-slate-800 dark:bg-slate-900">
                <dt className="text-xs text-slate-600 dark:text-slate-400">Compared with the clean full-resolution result (our stand-in for the paired ground truth)</dt>
                <dd className="mt-1">
                  <span className="text-lg font-bold tabular-nums">
                    {match.matched} of {match.base.minutiae.length}
                  </span>{' '}
                  reference minutiae recovered ({Math.round(match.recovered * 100)}%), plus <span className="font-bold tabular-nums">{match.spurious}</span> spurious ones.
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {result && (
        <section aria-labelledby="stages">
          <h2 id="stages" className="mb-3 text-xl font-bold">
            The pipeline, stage by stage
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.stages.map((s) => (
              <StageCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="sweep" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="sweep" className="text-xl font-bold">
          Sweep the distance: a miniature recoverability curve
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-800 dark:text-slate-200">
          The real study degrades many images and plots how well ridges are recovered against PPRP. This button does a tiny version: it runs the pipeline at several simulated distances and counts how many of the clean full-resolution minutiae are found again. Dashed lines mark the Nyquist limit and the two PPRP values from the GATTACA synthetic study.
        </p>
        <button type="button" disabled={!cv || sweeping} onClick={runSweep} className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {sweeping ? 'Running 9 simulations...' : 'Run the sweep'}
        </button>
        {sweep && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <SweepChart points={sweep} />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-1 text-left text-xs text-slate-600 dark:text-slate-400">Same data as a table</caption>
                <thead>
                  <tr className="border-b border-slate-300 dark:border-slate-700">
                    <th scope="col" className="p-1.5">Shrink</th>
                    <th scope="col" className="p-1.5">PPRP</th>
                    <th scope="col" className="p-1.5">Recovered</th>
                    <th scope="col" className="p-1.5">Spurious</th>
                  </tr>
                </thead>
                <tbody>
                  {sweep.map((p) => (
                    <tr key={p.downscale} className="border-b border-slate-200 tabular-nums dark:border-slate-800">
                      <td className="p-1.5">{p.downscale}x</td>
                      <td className="p-1.5">{p.pprp.toFixed(2)}</td>
                      <td className="p-1.5">{Math.round(p.recovered * 100)}%</td>
                      <td className="p-1.5">{p.spurious}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="mt-4 text-sm text-slate-800 dark:text-slate-200">
          <strong>Read it carefully.</strong> Below about 3 PPRP the share of recovered minutiae collapses and the pipeline starts inventing minutiae out of noise. Matching tolerance and a single synthetic print make this a teaching curve, not a measurement: the published curve needs paired real data and many fingers.
        </p>
      </section>

      <section aria-labelledby="map" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="map" className="text-xl font-bold">
          Pipeline stage to course unit
        </h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-700">
                <th scope="col" className="p-2">Stage</th>
                <th scope="col" className="p-2">Course topic</th>
              </tr>
            </thead>
            <tbody>
              {UNIT_MAP.map(([stage, topic, u]) => (
                <tr key={stage} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="p-2 font-medium">{stage}</td>
                  <td className="p-2">
                    <a className="text-indigo-700 underline dark:text-indigo-300" href={hrefFor.unit(u)}>
                      {topic}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="limits" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="limits" className="text-xl font-bold">
          Limitations
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>The sample is a synthetic ridge pattern, much more regular than a real finger. Real photos have curvature, lighting, skin texture, motion blur and compression.</li>
          <li>This is a simplified, browser-sized version of the pipeline: one global ridge period instead of a local map, a fixed bank of 16 orientations, no perspective rectification, no learned detector and no elastic deformation model.</li>
          <li>The exposure bands are quoted from the original project&apos;s synthetic-data study. They have not been re-measured on licensed real datasets.</li>
          <li>Minutiae counts are a teaching proxy. A real assessment matches against paired ground truth over many fingers.</li>
        </ul>
      </section>
    </div>
  );
}

function TermLinkInline({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <a href={hrefFor.term(id)} data-term-id={id} className="term-link">
      {children}
    </a>
  );
}
