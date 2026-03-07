import React, { Component } from 'react';
import { WeatherProvider } from './context/WeatherContext';
import MapScreen from './components/explore/MapScreen';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, info) { console.error('Sunstay Error:', error, info); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 bg-white flex items-center justify-center p-6">
                    <div className="text-center max-w-sm bg-white rounded-3xl p-8 shadow-2xl border border-gray-100">
                        <div className="text-5xl mb-4">🌥️</div>
                        <h2 className="text-xl font-black text-gray-900 mb-2">Something went wrong</h2>
                        <p className="text-gray-500 text-sm mb-6">{this.state.error?.message || 'An unexpected error occurred.'}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-amber-500 text-white font-bold rounded-xl"
                        >
                            Reload App
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const App = () => (
    <ErrorBoundary>
        <WeatherProvider>
            <MapScreen />
        </WeatherProvider>
    </ErrorBoundary>
);

export default App;
