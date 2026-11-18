import { forwardRef } from 'react';
import ClayIcon from './common/ClayIcon.jsx';
import VenueCard from './VenueCard.jsx';
import { HEATING_CHOICES } from '../utils/partnerWalkthrough.js';

/**
 * A listing that disagrees with itself, said plainly (Airbnb's "Add a payout
 * method" issue card): what guests are told, what the record says, and the
 * three answers. The guest view follows the answer straight away.
 */
export function PartnerListingCheck({ conflict, heating, onHeatingChange }) {
    return <section className="ss-partner-card ss-partner-check" aria-labelledby="partner-check-heading">
        <div className="ss-partner-check-head">
            <h3 id="partner-check-heading"><ClayIcon name="heater" size={32} />Your heating info doesn’t match</h3>
            <span className="ss-partner-preview-pill">Preview only</span>
        </div>
        <p className="ss-partner-check-problem">{conflict.summary} {conflict.risk}</p>
        <fieldset className="ss-partner-check-step">
            <legend className="ss-partner-check-question">Which is right?</legend>
            <div className="ss-partner-check-choices">
                {HEATING_CHOICES.map(choice => <label key={choice.id} className="ss-partner-check-choice">
                    <input type="radio" name="partner-heating" value={choice.id} checked={heating === choice.id}
                        onChange={() => onHeatingChange(choice.id)} />
                    <span><strong>{choice.label}</strong><small>{choice.guestSees}</small></span>
                </label>)}
            </div>
            <p role="status" className="ss-partner-save-status">{heating ? 'Guest view updated · Preview only' : ''}</p>
        </fieldset>
    </section>;
}

/**
 * The guest card itself (VenueCard in preview mode) with this preview's
 * changes, like Shopify's live storefront beside its editor. Guests still see
 * the current listing; nothing here is published.
 */
export const PartnerGuestView = forwardRef(function PartnerGuestView({ venue, liveVenueFeatures, removed, onBack, stayDate = null }, frameRef) {
    return <section className="ss-partner-guest" aria-labelledby="partner-guest-heading">
        <div className="ss-partner-check-head">
            <h3 id="partner-guest-heading" tabIndex={-1}>Guest view</h3>
            <span className="ss-partner-preview-pill">Preview only</span>
        </div>
        <p className="ss-partner-help">Your real guest card with this preview’s changes. Guests still see your current listing.</p>
        {removed.length ? <p className="ss-partner-guest-removed">Off your card in this preview: {removed.map((label, index) =>
            <span key={label}>{index ? ', ' : ''}<s>{label}</s></span>)}</p> : null}
        <div ref={frameRef} className="ss-partner-guest-frame">
            {/* A stay's chosen date reaches the card the way a guest's stay search does. */}
            <VenueCard preview venue={venue} liveVenueFeatures={liveVenueFeatures} onClose={onBack}
                stayMatch={stayDate ? { daily: { date: stayDate } } : undefined} />
        </div>
    </section>;
});
