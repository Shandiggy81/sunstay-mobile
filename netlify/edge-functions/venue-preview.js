// Venue link previews: a shared ?venue=<id> link shows that venue's name in
// iMessage, WhatsApp, Slack and the like, not the general SunStay card.
// Runs only for crawler user agents on "/", so people opening the link never
// reach it. The work and its tests are in src/utils/venuePreviewMeta.js.
import { LINK_PREVIEW_AGENTS, venuePreviewResponse } from '../../src/utils/venuePreviewMeta.js';

export default (request, context) => venuePreviewResponse(request, {
    next: () => context.next(),
    env: key => Netlify.env.get(key),
});

export const config = {
    path: '/',
    method: 'GET',
    header: { 'user-agent': LINK_PREVIEW_AGENTS },
    // A crash serves the normal page instead of an error.
    onError: 'bypass',
};
