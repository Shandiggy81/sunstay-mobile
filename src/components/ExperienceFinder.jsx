import React from 'react';
import ClayIcon from './common/ClayIcon.jsx';
import { DISCOVERY_EXPERIENCES } from '../utils/discoveryExperience.js';

export default function ExperienceFinder({ selected, onSelect, onClear, canClear, context, dataLabel }) {
    return <section className="ss-experience-finder" aria-labelledby="experience-finder-title">
        <div className="ss-experience-inner">
            <div className="ss-experience-heading">
                <div>
                    <h1 id="experience-finder-title">Find your kind of day</h1>
                    <p>Sunshine, shelter or a brighter stay.</p>
                </div>
                {canClear && <button type="button" className="ss-experience-clear" onClick={onClear}>Clear experience</button>}
            </div>
            <div className="ss-experience-options" role="group" aria-label="Find an experience">
                {DISCOVERY_EXPERIENCES.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id}
                    onClick={() => onSelect(item.id)}>
                    <ClayIcon name={item.icon} size={32} />
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>)}
            </div>
            <p className="ss-discovery-context">{context}</p>
            <p className="ss-discovery-source">{dataLabel}</p>
        </div>
    </section>;
}
