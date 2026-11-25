/**
 * Sunny's quick-reply chips, and the chip a typed message asks for.
 *
 * The chat shows the first SUNNY_CHIPS_SHOWN chips in today's order: the
 * time-of-day chip, then the ones the weather suggests. The others still
 * answer when typed: "dog friendly" or "any rooftop bars?" gets the same reply,
 * map filter and venue rows as a tap, worked out on the phone. Only asks a chip
 * can't answer go to chat-sunny, which spends Gemini.
 */

import { chatUvText, readChatWeather } from './chatWeather.js';
import { foldSearchText } from './searchText.js';
import { timeOfDayChip } from './sunnySuggestions.js';

export const DOG_TAG = 'Pet Friendly';
export const SUNNY_CHIPS_SHOWN = 4;

const lead = (chips, intents) => [
    ...intents.map((intent) => chips.find((chip) => chip.intent === intent)),
    ...chips.filter((chip) => !intents.includes(chip.intent)),
];

/**
 * Every chip for this weather and Melbourne hour, in the order they're offered.
 * `tag` picks the venue rows under the reply (null = best sun score overall);
 * `suggest: false` shows none.
 *
 * @param {object|null} weather WeatherContext weather
 * @param {number} hour Melbourne wall-clock hour, 0–23
 */
export function buildQuickReplies(weather, hour) {
    const cw = readChatWeather(weather);
    const all = [
        { intent: 'sunny',      icon: 'sun',           text: 'Sunny outdoor spots',   tag: null,                    response: `Ripper! ${chatUvText(cw)}. These are getting the best sun right now.`, action: 'onFindSunny' },
        { intent: 'cloudy',     icon: 'umbrella',      text: 'Covered and cosy',      tag: 'Indoor Warmth',         response: 'Smart move. Here are some covered, cosy spots.',                       action: 'onFindIndoor' },
        { intent: 'wind',       icon: 'windsock',      text: 'Out of the wind',       tag: 'Shaded',                response: "Yeah it's blowy out there! These are more protected.",                 action: 'onFindWindSheltered' },
        { intent: 'indoor',     icon: 'indoor-warmth', text: 'Rainy day picks',       tag: 'Indoor Warmth',         response: 'Staying dry, good call. A few warm indoor spots.',                     action: 'onFindIndoor' },
        { intent: 'rooftop',    icon: 'rooftop-bar',   text: 'Rooftop bars',          tag: 'Rooftop',               response: 'Rooftops incoming! These are scoring best right now.',                 action: 'onFindRooftop' },
        { intent: 'dog',        icon: 'brucey',        text: 'Dog-friendly spots',    tag: DOG_TAG,                 response: 'Bring the pup! Filtering to dog-friendly venues.',                     action: 'onFindDogFriendly' },
        { intent: 'family',     icon: 'pram',          text: 'Family-friendly',       tag: 'Pram Friendly',         response: 'Family outing! A few pram-friendly spots.',                            action: 'onFindFamily' },
        { intent: 'business',   icon: 'large-groups',  text: 'Room for a group',      tag: 'Large Groups',          response: 'Bringing the crew? These have room.',                                  action: 'onFindBusiness' },
        { intent: 'accessible', icon: 'wheelchair',    text: 'Wheelchair accessible', tag: 'Wheelchair Accessible', response: 'On it. These are wheelchair accessible.',                              action: 'onFindWheelchair' },
        { intent: 'smoking',    icon: 'smoking-area',  text: 'Smoking areas',         tag: 'Smoking Area',          response: 'Got it. These have an outdoor smoking area.',                          action: 'onFindSmoking' },
        { intent: 'surprise',   icon: 'sparkles',      text: 'Surprise me',           suggest: false,               response: 'Ooh, adventurous! Picking one for you now.',                           action: 'onSurpriseMe' },
    ];

    // Weather-led chips come first.
    let ordered;
    if (cw.isRain) ordered = lead(all, ['indoor']);
    else if ((cw.uv ?? 0) >= 8) ordered = lead(all, ['cloudy']);
    else if ((cw.windKmh ?? 0) > 30) ordered = lead(all, ['wind']);
    else ordered = lead(all, ['sunny', 'rooftop']);

    // A chip for this part of the day (morning coffee, lunch, after-work, sunset) leads.
    return [timeOfDayChip(hour), ...ordered].filter(Boolean);
}

// "dogs" and "dog", "puppies" and "puppy": both sides go through this.
function stem(word) {
    if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    return word;
}

const wordSet = (words) => new Set(words.split(' ').map(stem));

// How people ask, around a chip's own words: "show me", "any", "spots",
// "right now". Every other word (a venue, a suburb, a time, "near", "it" in
// "is it raining?") means the chip can't answer it, so the ask goes to
// chat-sunny.
const FILLER = wordSet([
    'a an the some any anything anywhere somewhere something',
    'i im ive id me my we us our you ya',
    'is are can could do have got know there theres',
    'show find give get recommend suggest suggestion list want wanna need like love looking look after keen',
    'for to go going head in at on of with and or',
    'now right today currently',
    'spot place venue option idea where wheres what whats which',
    'good best nice great top decent ok okay',
    'please pls plz thank thanks ta cheers mate',
].join(' '));

// "hey Sunny, …", "g'day …"
const GREETING = /^(hey|hi|hiya|hello|gday|g day|yo|oi)( there)?( sunny)?\b/;

// Each chip's own words. A typed ask matches the chip when it has at least one
// `key` word and every other word is one of the chip's `also` words or filler.
const CHIP_WORDS = Object.freeze({
    sunny: { key: 'sun sunny sunshine sunniest sunlit outdoor outdoors outside alfresco fresco', also: 'al seat seating sit sitting table area most getting catch bit little warm bright' },
    cloudy: { key: 'covered cover undercover cosy cozy snug', also: 'under warm inside indoor' },
    wind: { key: 'wind windy sheltered shelter breeze breezy gust gusty blowy protected', also: 'out from away calm sit' },
    indoor: { key: 'rain rainy raining wet indoor indoors inside dry drizzle', also: 'day pick out from stay staying keep cosy cozy warm' },
    rooftop: { key: 'rooftop roof skybar', also: 'bar top terrace deck drink view high up sky' },
    dog: { key: 'dog doggo doggy doggie pet pup puppy puppies pooch brucey', also: 'friendly allowed welcome welcoming bring take' },
    family: { key: 'family families kid child children pram toddler baby babies bub', also: 'friendly bring take little young' },
    business: { key: 'group crew party large big gang bunch team', also: 'room table friend mate people booking lot space whole work' },
    accessible: { key: 'wheelchair accessible accessibility access disabled disability mobility ramp step', also: 'friendly free level entry entrance' },
    smoking: { key: 'smoking smoke smoker cigarette ciggie ciggies durry durries vape vaping', also: 'area section allowed friendly outdoor outside' },
    surprise: { key: 'surprise random randomly idk dunno whatever pick choose', also: 'one just something' },
    morning: { key: 'coffee cafe latte cappuccino espresso flat brekkie brekky breakfast', also: 'morning white cup specialty sun sunny sunshine outside outdoor' },
    lunch: { key: 'lunch lunches brunch lunchtime', also: 'sun sunny sunshine outside outdoor outdoors eat bite quick' },
    'after-work': { key: 'work knockoff knock beer pint schooner drink garden', also: 'off cold quick sun sunny outside outdoor' },
    sunset: { key: 'sunset sundown golden dusk view', also: 'hour watch watching catch drink' },
});

const VOCAB = new Map(Object.entries(CHIP_WORDS).map(([intent, words]) => [intent, { key: wordSet(words.key), also: wordSet(words.also) }]));

/** The message's words that aren't filler, folded and stemmed. */
export function chipAskWords(text) {
    const folded = foldSearchText(text).replace(GREETING, ' ');
    return folded.split(/\s+/).filter(Boolean).map(stem).filter((word) => !FILLER.has(word));
}

/**
 * The chip a typed message asks for, or null when the message asks for more
 * than one chip can answer, or for nothing a chip answers.
 *
 * @param {string} text the guest's message
 * @param {object[]} chips buildQuickReplies() for now: the shown chips and the rest
 */
export function chipForText(text, chips) {
    if (!Array.isArray(chips)) return null;
    const words = chipAskWords(text);
    if (!words.length) return null;
    const matches = chips.filter((chip) => {
        const vocab = VOCAB.get(chip?.intent);
        return Boolean(vocab)
            && words.some((word) => vocab.key.has(word))
            && words.every((word) => vocab.key.has(word) || vocab.also.has(word));
    });
    const [first] = matches;
    if (!first) return null;
    // "Cosy inside" fits both indoor chips. They show the same venues, so the
    // first in today's order answers; chips that answer differently leave the
    // ask to chat-sunny.
    return matches.every((chip) => chip.tag === first.tag && chip.action === first.action) ? first : null;
}
