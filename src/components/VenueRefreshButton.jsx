import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Keyboard-accessible fallback for mascot pull-to-refresh.
 * Stops pointer propagation so the sheet handle still expands/collapses.
 */
export default function VenueRefreshButton({
    onRefresh,
    isRefreshing = false,
    disabled = false,
    className = '',
}) {
    const busy = Boolean(isRefreshing);
    return (
        <button
            type="button"
            className={`ss-venue-refresh-btn ${busy ? 'ss-venue-refresh-btn--busy' : ''} ${className}`.trim()}
            aria-label={busy ? 'Refreshing venues' : 'Refresh venues'}
            aria-busy={busy}
            disabled={disabled || busy}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (disabled || busy) return;
                onRefresh?.();
            }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <RefreshCw size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
    );
}
