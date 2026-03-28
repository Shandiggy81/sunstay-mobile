import React from 'react';

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Map Intelligence Error:', error, errorInfo);
    
    // Silent retry: only once within the first failure
    if (this.state.retryCount < 1) {
      setTimeout(() => {
        this.setState({ hasError: false, retryCount: 1 });
      }, 3000);
    }
  }

  render() {
    if (this.state.hasError) {
      const accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
      const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/144.9631,-37.8136,11,0/800x600?access_token=${accessToken}`;

      return (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center overflow-hidden rounded-[32px] bg-orange-950/20 backdrop-blur-sm">
          {/* Static Map Background Placeholder */}
          <img 
            src={staticMapUrl} 
            alt="Map Preview" 
            className="absolute inset-0 w-full h-full object-cover opacity-60 grayscale"
          />
          
          <div className="absolute inset-0 bg-gradient-to-b from-orange-950/40 via-transparent to-orange-950/60" />

          <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
            {/* Animated Sunstay Badge */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2.5 px-6 py-3 bg-amber-500 rounded-2xl shadow-[0_4px_20px_rgba(245,158,11,0.4)] animate-pulse">
                <span className="text-xl">🗺️</span>
                <span className="text-amber-950 font-black text-sm uppercase tracking-wider">Map Loading…</span>
              </div>
              <p className="text-white font-bold text-xs uppercase tracking-[3px] opacity-70">Sunstay Intelligence</p>
            </div>

            <div className="max-w-[200px] h-[1px] w-full bg-white/20" />

            <button
              onClick={() => window.location.reload()}
              className="group flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-black py-3 px-8 rounded-2xl shadow-xl transition-all active:scale-95"
            >
              <span>↻</span>
              <span className="text-xs uppercase tracking-widest">Retry Dashboard</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default MapErrorBoundary;
