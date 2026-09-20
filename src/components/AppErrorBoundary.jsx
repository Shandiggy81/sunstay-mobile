import React, { Component } from 'react';
import { logReactRenderError } from '../utils/iosCrashLog';
import { resolveAppErrorView } from '../utils/appErrorFallback';

class AppErrorBoundary extends Component {
    state = { hasError: false, error: null };

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('Sunstay Error:', error, info);
        logReactRenderError(error, 'AppErrorBoundary');
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        const view = resolveAppErrorView({
            hasError: this.state.hasError,
            children: this.props.children,
        });

        if (view.kind !== 'fallback') {
            return this.props.children;
        }

        return (
            <div
                data-react-render-error="1"
                className="flex min-h-dvh items-center justify-center bg-slate-50 p-6"
            >
                <div
                    role={view.role}
                    className={`w-full max-w-md p-8 text-center ${view.cardClass}`}
                >
                    <h1 className="text-2xl font-black tracking-tight text-slate-900">
                        {view.title}
                    </h1>
                    <p className="mt-2 text-sm font-medium text-slate-600">
                        The app hit an unexpected error. Reload to try again.
                    </p>
                    <button
                        type="button"
                        onClick={this.handleReload}
                        className="mt-6 min-h-11 rounded-xl bg-amber-500 px-6 text-sm font-bold text-slate-900 shadow-sm transition-colors hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                    >
                        {view.reloadLabel}
                    </button>
                </div>
            </div>
        );
    }
}

export default AppErrorBoundary;
