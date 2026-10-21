import React from 'react';
import ClayIcon from './common/ClayIcon.jsx';
import { DISCOVERY_EXPERIENCES } from '../utils/discoveryExperience.js';

export default function ExperienceFinder({ selected, onSelect, onClear, canClear }) {
    return <section className="ss-experience-finder ss-home-moments" aria-label="Find your kind of day">
        <div className="ss-experience-options" role="group" aria-label="Find an experience">
            {DISCOVERY_EXPERIENCES.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id}
                onClick={() => onSelect(item.id)}>
                <ClayIcon name={item.icon} size={24} />
                <span><strong>{item.label}</strong><small className="sr-only">{item.detail}</small></span>
            </button>)}
        </div>
        {canClear && <button type="button" className="ss-experience-clear" onClick={onClear}>Clear experience</button>}
    </section>;
}
