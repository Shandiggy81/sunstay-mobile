import React from 'react';
import { ArrowUp } from 'lucide-react';
import { describeWindExposure } from '../utils/windExposure.js';
import { compassPoint, formatNoiseSource, NOISE_STEPS, noiseStepIndex } from '../utils/comfortDisplay.js';

export default function OutdoorComfortTiles({ wind, noise, hourLabel, venue }) {
    const hasWind = Number.isFinite(wind?.effectiveWindMs);
    const noiseStep = noiseStepIndex(noise?.label);
    if (!hasWind && noiseStep === null) return null;
    const direction = compassPoint(wind?.direction);
    const sheltered = wind?.directional && wind.factor < 1;
    return (
        <div className="mt-3 text-slate-700" data-outdoor-comfort role="status">
            <p className="mb-2 text-[12px] font-bold">Outdoor comfort · {hourLabel ?? 'Selected hour'}</p>
            <div className={`grid gap-2 ${hasWind && noiseStep !== null ? 'grid-cols-1 min-[360px]:grid-cols-2' : 'grid-cols-1'}`}>
                {hasWind && <div className={`min-w-0 rounded-xl border p-3 ${wind.tunnel ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <p className="text-[12px] font-semibold text-slate-500">Wind here</p>
                    <p className="mt-1 text-[28px] font-extrabold leading-tight text-slate-800">{Math.round(wind.effectiveWindMs * 3.6)} <span className="text-[12px] font-medium text-slate-500">km/h</span></p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-medium">
                        {direction && <span className="flex items-center gap-1"><ArrowUp size={12} aria-hidden="true" className="shrink-0" style={{ transform: `rotate(${wind.direction + 180}deg)` }} />From {direction}</span>}
                        {Number.isFinite(wind.effectiveGustMs) && <span><span className="block text-slate-500">Gusts</span><span className="whitespace-nowrap">{Math.round(wind.effectiveGustMs * 3.6)} km/h</span></span>}
                    </div>
                    {sheltered && <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Sheltered</span>}
                </div>}
                {noiseStep !== null && <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[12px] font-semibold text-slate-500">Noise</p>
                    <p className={`mt-1 font-extrabold leading-tight text-slate-800 ${noiseStep === 1 ? 'text-[16px]' : 'text-[22px]'}`}>{noise.label}</p>
                    <div className="mt-3 grid grid-cols-4 gap-1" role="img" aria-label={`Noise scale: ${NOISE_STEPS.join(', ')}. Current level: ${noise.label}.`}>
                        {NOISE_STEPS.map((step, index) => <span key={step} title={step} className={`h-1.5 rounded-full ${index === noiseStep ? 'bg-amber-400' : 'bg-slate-100'}`} />)}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-500" aria-hidden="true"><span>Quiet</span><span>Loud</span></div>
                    <p className="mt-2 text-[11px] font-medium text-slate-600">{formatNoiseSource(noise.source)}</p>
                </div>}
            </div>
            {hasWind && wind.tunnel && <p className="mt-2 text-[12px] font-semibold text-amber-900">{describeWindExposure(wind, hourLabel === 'Now' ? 'now' : `at ${hourLabel ?? 'this hour'}`)}</p>}
            <p className="mt-2 text-[11px] text-slate-500">{venue.comfortProfilesIllustrative ? 'Illustrative profiles · ' : 'Profile-based estimates · '}{noise?.note ?? wind?.note ?? 'Verify conditions at the outdoor space.'}</p>
        </div>
    );
}
