import React from 'react';
import { CloudOff } from 'lucide-react';
import { logReactRenderError } from '../../utils/iosCrashLog';
import { noteSunForecast } from '../../utils/sunForecastDiagnostics';

/**
 * Confines a render failure to one panel.
 *
 * The forecast panels read live third-party weather payloads whose shape is not
 * under our control, so a single unexpected field can throw mid-render. Without
 * a local boundary that throw unwinds to the app-level ErrorBoundary and takes
 * the entire screen down — the user loses the venue sheet, their filters and
 * their map position. Catching it here keeps the surrounding sheet interactive
 * and degrades only the panel that could not render.
 *
 * This backs up the per-field guards in the panels themselves; it is not a
 * substitute for them.
 */
class ForecastErrorBoundary extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('Forecast panel failed to render:', error, info);
        logReactRenderError(error, 'ForecastErrorBoundary');
        noteSunForecast(new Set(), 'sun-forecast-error-boundary', {
            reason: error?.message || 'render-error',
            state: 'error',
        });
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        if (this.props.fallback !== undefined) return this.props.fallback;

        return (
            <div className="flex items-center gap-2.5 rounded-2xl border border-slate-900/[0.06] bg-slate-50 px-4 py-3.5 text-left">
                <CloudOff size={16} className="flex-shrink-0 text-slate-400" aria-hidden="true" />
                <p className="text-[13px] font-medium leading-snug text-slate-500">
                    Forecast data unavailable right now. Everything else on this venue still works.
                </p>
            </div>
        );
    }
}

export default ForecastErrorBoundary;
