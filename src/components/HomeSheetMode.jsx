import React from 'react';
import ClayIcon from './common/ClayIcon';

export default function HomeSheetMode({ mode, onChange }) {
    return (
        <div className="ss-home-sheet-mode" role="group" aria-label="Home sheet mode"
            onPointerDownCapture={event => event.stopPropagation()}>
            {[['sun', 'Sun', 'sun'], ['after-dark', 'After Dark', 'night']].map(([value, label, icon]) => (
                <button key={value} type="button" aria-pressed={mode === value}
                    onClick={event => { event.stopPropagation(); onChange(value); }}>
                    <ClayIcon name={icon} size={26} />{label}
                </button>
            ))}
        </div>
    );
}
