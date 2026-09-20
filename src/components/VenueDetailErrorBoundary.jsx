import React from 'react';
import { logReactRenderError } from '../utils/iosCrashLog';

/**
 * Temporary boundary around venue detail content.
 * Logs the thrown error and the component stack without taking down the map.
 */
class VenueDetailErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[VenueDetailErrorBoundary]', error?.message);
    logReactRenderError(error, 'VenueDetailErrorBoundary');
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        data-venue-detail-error="1"
        data-react-render-error="1"
        data-render-branch="error"
        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5"
      >
        <p className="text-[15px] font-semibold text-rose-900">
          Venue details hit an error
        </p>
        <p className="mt-1 text-[13px] font-medium text-rose-800">
          Close and reopen this venue. The map and list still work.
        </p>
      </div>
    );
  }
}

export default VenueDetailErrorBoundary;
