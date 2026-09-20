export const APP_ERROR_TITLE = 'Something went wrong';
export const APP_ERROR_RELOAD_LABEL = 'Reload App';

export function resolveAppErrorView({ hasError = false, children = null } = {}) {
    if (!hasError) {
        return { kind: 'children', isNull: false, node: children ?? null };
    }
    return {
        kind: 'fallback',
        isNull: false,
        role: 'alert',
        title: APP_ERROR_TITLE,
        reloadLabel: APP_ERROR_RELOAD_LABEL,
        reloadAction: 'window.location.reload',
        cardClass: 'rounded-3xl border border-amber-200 bg-amber-50 text-slate-900 shadow-xl',
    };
}
