import React from 'react';

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('MapErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 text-center bg-orange-50/90 backdrop-blur-md rounded-[24px]">
          <div className="max-w-md">
            <div className="text-6xl mb-6 animate-pulse">☀️</div>
            <h2 className="text-2xl font-bold text-orange-950 mb-3">Map Intelligence Paused</h2>
            <p className="text-orange-900/70 mb-8 leading-relaxed">
              A technical hiccup occurred while calculating sun paths. Don't worry, the dashboard can be restored instantly.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-8 rounded-2xl shadow-lg transition-all active:scale-95"
            >
              Restart Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default MapErrorBoundary;
