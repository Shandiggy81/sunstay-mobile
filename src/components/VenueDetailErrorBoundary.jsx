import React from 'react';
import { logReactRenderError } from '../utils/iosCrashLog';
import { resolveVenueDetailErrorView } from '../utils/venueDetailErrorFallback';

/**
 * Temporary boundary around venue detail content.
 * Logs the thrown error and the component stack without taking down the map.
 * A caught error always renders a visible retry/close card — never null.
 */
class VenueDetailErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[VenueDetailErrorBoundary]', error?.message);
    logReactRenderError(error, 'VenueDetailErrorBoundary');
  }

  componentDidUpdate(prevProps) {
    if (prevProps.venueId !== this.props.venueId && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  handleClose = () => {
    this.setState({ hasError: false });
    this.props.onClose?.();
  };

  render() {
    const view = resolveVenueDetailErrorView({
      hasError: this.state.hasError,
      children: this.props.children,
    });

    if (view.kind !== 'fallback') {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        data-venue-detail-error="1"
        data-react-render-error="1"
        data-render-branch="error"
        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5"
      >
        <p className="text-[15px] font-semibold text-rose-900">
          {view.title}
        </p>
        <p className="mt-1 text-[13px] font-medium text-rose-800">
          {view.body}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className="min-h-11 rounded-xl bg-rose-900 px-3.5 text-[13px] font-semibold text-white"
          >
            {view.retryLabel}
          </button>
          <button
            type="button"
            onClick={this.handleClose}
            className="min-h-11 rounded-xl border border-rose-200 bg-white px-3.5 text-[13px] font-semibold text-rose-900"
          >
            {view.closeLabel}
          </button>
        </div>
      </div>
    );
  }
}

export default VenueDetailErrorBoundary;
