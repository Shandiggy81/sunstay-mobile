import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Send, Sun, Cloud, CloudRain, Wind, Thermometer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMicroclimateActions, useMicroclimateState } from '../context/MicroclimateContext';
import {
  applySunnyToolCalls,
  buildSunnyContext,
  parseChatSunnyResponse,
  postChatSunny,
  friendlyChatError,
  toLlmMessages,
} from '../utils/sunnyTools';
import thunderBuddy from '../assets/mascots/thunder-buddy.png';
import ClayIcon, { clayIconUrl } from './common/ClayIcon';
import VenueIcon from './common/VenueIcon';
import { resolveChatAvatarKind } from '../utils/resolveChatAvatar';
import { chatWindLabel } from '../utils/windUnits';
import { chatTempText, chatUvText, readChatWeather } from '../utils/chatWeather';
import { useWeather } from '../context/WeatherContext';
import { melbourneHourNow } from '../utils/microclimate';
import { venueDisplayScore } from '../utils/venueDisplayScore';
import { venueIcon } from '../utils/clayIcons';
import { sunnyFocusVenues } from '../utils/venueAmenities';
import { venuesNamedInText, withNamedVenues } from '../utils/venueNameMatch.js';
import { listSunStatus, venueSunForecast } from '../utils/venueSun';
import {
  BRUCEY_LINE,
  isDogIntent,
  resolveSuggestedVenues,
  suggestionCardDetails,
  suggestVenuesForTag,
  timeOfDayChip,
} from '../utils/sunnySuggestions';

// Sunny is the clay sun in sunglasses; Thunder Buddy stays for storms.
const SUNNY_AVATAR = { src: clayIconUrl('high-uv'), alt: 'Sunny', clay: true };
const CHAT_AVATARS = {
  thunder: { src: thunderBuddy, alt: 'Thunder Buddy' },
  sunny: SUNNY_AVATAR,
  default: SUNNY_AVATAR,
};

// Melbourne CBD: the forecast point for chat context (same as WeatherContext).
const CBD = { lat: -37.8136, lng: 144.9631 };
const DOG_TAG = 'Pet Friendly';

// ─── Weather helpers ───────────────────────────────────────────────────────────
const getWeatherMood = (weather) => {
  const cw = readChatWeather(weather);
  if (!cw.available) return { emoji: '😎', label: 'Ready to help', gradient: 'from-amber-400 via-orange-400 to-yellow-500' };
  const wind = cw.windKmh ?? 0;
  if (cw.isRain) return { emoji: '🌧️', label: 'Rainy day mode', gradient: 'from-slate-400 via-blue-400 to-slate-500' };
  if (wind > 30) return { emoji: '💨', label: 'Windy out there!', gradient: 'from-teal-400 via-cyan-400 to-blue-400' };
  if ((cw.uv ?? 0) >= 8) return { emoji: '🕶️', label: 'UV is high today', gradient: 'from-orange-500 via-red-400 to-orange-400' };
  if ((cw.cloud ?? 0) > 70) return { emoji: '☁️', label: 'Cloudy vibes', gradient: 'from-gray-400 via-slate-400 to-gray-500' };
  // Same day/night flag the header uses for its moon, so the chat never says "day" after sunset.
  if (weather?.isDay === false) return { emoji: '🌙', label: 'Great night out', gradient: 'from-amber-400 via-orange-400 to-yellow-500' };
  if ((cw.temp ?? 0) >= 28) return { emoji: '🌞', label: 'Cracking day!', gradient: 'from-yellow-400 via-amber-400 to-orange-400' };
  return { emoji: '😎', label: 'Great day out', gradient: 'from-amber-400 via-orange-400 to-yellow-500' };
};

const buildGreeting = (weather) => {
  const cw = readChatWeather(weather);
  if (!cw.available) return "G'day! I'm Sunny ☀️ Live weather isn't available right now, but tell me what kind of spot you're after!";
  const temp = chatTempText(cw);
  const wind = cw.windKmh ?? 0;
  if (cw.isRain) return `G'day! It's ${temp ? `${temp} and ` : ''}raining out there right now 🌧️ Let me find you a cosy indoor spot — what kind of vibe are you after?`;
  if ((cw.uv ?? 0) >= 8) return `G'day! UV is sitting at ${cw.uv} right now ☀️ Pretty intense — I'd recommend shaded or covered venues. What are you after?`;
  if (wind > 30) return `G'day! It's ${temp ? `${temp} but ` : ''}pretty windy at ${chatWindLabel(weather) ?? `${Math.round(wind)} km/h`} 💨 Wind-sheltered spots are the move today. What sounds good?`;
  if (!temp) return "G'day! I'm Sunny 😎 I can't get the temperature right now — what kind of venue are you after today?";
  if ((cw.cloud ?? 0) > 70) return `G'day! It's ${temp} and overcast today ☁️ Perfect weather for a cosy indoor or covered spot. What kind of venue are you after?`;
  if (cw.temp >= 26) return `G'day! It's a beautiful ${temp} out right now ☀️ Perfect rooftop weather! What kind of spot are you looking for?`;
  return `G'day! I'm Sunny — it's ${temp} out there right now 😎 What kind of venue are you after today?`;
};

// ─── Keyword matcher for free-text input ──────────────────────────────────────
const matchIntent = (text) => {
  const t = text.toLowerCase();
  if (/roof|rooftop|elevated|view|sky|high/.test(t)) return 'rooftop';
  if (/dog|pet|puppy|pup|animal/.test(t)) return 'dog';
  if (/rain|wet|indoor|inside|shelter|cover/.test(t)) return 'indoor';
  if (/wind|shelter|protected|breeze/.test(t)) return 'wind';
  if (/cloud|overcast|grey|cosy|cozy/.test(t)) return 'cloudy';
  if (/sun|sunny|warm|hot|bright|outside|outdoor/.test(t)) return 'sunny';
  if (/family|kid|child|children/.test(t)) return 'family';
  if (/work|business|laptop|meeting|wifi/.test(t)) return 'business';
  if (/wheel|access|disability|disabled/.test(t)) return 'accessible';
  if (/smoke|smoking|cigarette/.test(t)) return 'smoking';
  if (/surprise|anything|random|whatever|idk/.test(t)) return 'surprise';
  return null;
};

// ─── Quick reply definitions ───────────────────────────────────────────────────
const buildQuickReplies = (weather) => {
  const cw = readChatWeather(weather);
  const isRain = cw.isRain;
  const uv = cw.uv ?? 0;
  const wind = cw.windKmh ?? 0;

  // `tag` picks the venue cards shown under the reply (null = best sun score
  // overall); `suggest: false` shows none.
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

  // Surface weather-contextual suggestions first
  let ordered = [...all];
  if (isRain) ordered = [all.find(r => r.intent === 'indoor'), ...all.filter(r => r.intent !== 'indoor')];
  else if (uv >= 8) ordered = [all.find(r => r.intent === 'cloudy'), ...all.filter(r => r.intent !== 'cloudy')];
  else if (wind > 30) ordered = [all.find(r => r.intent === 'wind'), ...all.filter(r => r.intent !== 'wind')];
  else ordered = [all.find(r => r.intent === 'sunny'), all.find(r => r.intent === 'rooftop'), ...all.filter(r => !['sunny','rooftop'].includes(r.intent))];

  // A chip for this part of the day (morning coffee, lunch, after-work, sunset) leads.
  return [timeOfDayChip(melbourneHourNow()), ...ordered].filter(Boolean);
};

// ─── Follow-up chips shown after an action ────────────────────────────────────
const followUpChips = [
  { text: 'Try a different vibe', icon: 'sparkles',   resetsChat: true },
  { text: 'Show on map',          icon: 'map-pin',    resetsChat: false, action: 'onShowOnMap', suggest: false },
  { text: 'Dog-friendly only',    icon: 'brucey',     resetsChat: false, action: 'onFindDogFriendly', tag: DOG_TAG },
  { text: 'Accessible venues',    icon: 'wheelchair', resetsChat: false, action: 'onFindWheelchair', tag: 'Wheelchair Accessible' },
];

const chipClass =
  'flex-shrink-0 snap-start inline-flex min-h-11 items-center gap-1.5 pl-1.5 pr-4 bg-white border border-slate-200 rounded-full text-[13px] font-semibold text-slate-800 hover:border-amber-400 hover:bg-amber-50 shadow-sm transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

// ─── Venue mini cards under a reply ───────────────────────────────────────────
const VenueSuggestionCards = ({ venues, statusFor, onOpen }) => (
  <ul className="mt-2 flex w-full max-w-[88%] flex-col gap-2" aria-label="Suggested venues">
    {venues.map((venue) => {
      const status = statusFor(venue);
      const { name, amenities, accessibleName } = suggestionCardDetails(venue, status.text);
      return (
        <li key={venue.id}>
          <button
            type="button"
            onClick={() => onOpen(venue)}
            className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition-colors hover:border-amber-400 active:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label={accessibleName}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <VenueIcon icon={venueIcon(venue)} size={36} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-slate-900">{name}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <ClayIcon name={status.icon} size={16} />
                  <span>{status.text}</span>
                </span>
                {amenities.map((amenity) => (
                  <span key={amenity.key} className="inline-flex items-center gap-1 whitespace-nowrap">
                    <ClayIcon name={amenity.icon} size={18} />
                    <span>{amenity.short}</span>
                  </span>
                ))}
              </span>
            </span>
          </button>
        </li>
      );
    })}
  </ul>
);

// ─── Typing indicator ─────────────────────────────────────────────────────────
const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 6 }}
    className="flex justify-start"
  >
    <div className="bg-white border border-gray-100 rounded-3xl rounded-bl-md px-5 py-4 shadow-sm flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-2 h-2 bg-amber-400 rounded-full block"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  </motion.div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const ChatWidget = ({
  isOpen,
  onClose,
  weather = null,
  selectedVenue = null,
  onSetFilters,
  onFindWheelchair,
  onFindDogFriendly,
  onFindSmoking,
  onSurpriseMe,
  onShowOnMap,
  onFindFamily,
  onFindBusiness,
  onFindSunny,
  onFindRooftop,
  onFindIndoor,
  onFindWindSheltered,
  venues = [],
  sunMomentsById = null,
  onOpenVenue,
}) => {
  const actionMap = {
    onFindWheelchair,
    onFindDogFriendly,
    onFindSmoking,
    onSurpriseMe,
    onShowOnMap,
    onFindFamily,
    onFindBusiness,
    onFindSunny,
    onFindRooftop,
    onFindIndoor,
    onFindWindSheltered,
  };
  const mood = getWeatherMood(weather);
  const liveWeather = readChatWeather(weather);
  const avatar = CHAT_AVATARS[resolveChatAvatarKind(weather)];
  const quickReplies = buildQuickReplies(weather);
  const { byId, todMinutes } = useMicroclimateState();
  const { setTodMinutes } = useMicroclimateActions();
  const { calculateSunScore } = useWeather();
  // Demo or failed weather must not be presented as a forecast.
  const forecastWeather = liveWeather.available && weather?.source !== 'demo' ? weather : null;
  // Same ranking score and status line as the venue list.
  const scoreFor = useCallback(
    (venue) => venueDisplayScore(venue, { byId, todMinutes, calculateSunScore }),
    [byId, todMinutes, calculateSunScore],
  );
  const statusFor = useCallback(
    (venue) => listSunStatus(venueSunForecast({ venue, weather: forecastWeather })),
    [forecastWeather],
  );

  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasActed, setHasActed] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const timeoutIdsRef = useRef(new Set());

  const scheduleTimeout = useCallback((callback, delay) => {
    const id = setTimeout(() => {
      timeoutIdsRef.current.delete(id);
      callback();
    }, delay);
    timeoutIdsRef.current.add(id);
    return id;
  }, []);

  useEffect(() => () => {
    timeoutIdsRef.current.forEach(clearTimeout);
    timeoutIdsRef.current.clear();
  }, []);

  // Reset & seed greeting when opened
  useEffect(() => {
    if (isOpen) {
      setMessages([{ id: 1, type: 'bot', text: buildGreeting(weather), ts: new Date() }]);
      setHasActed(false);
      setInputValue('');
      scheduleTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [isOpen, scheduleTimeout, weather]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const addUserMsg = (text) => {
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', text, ts: new Date() }]);
  };

  const addBotMsg = (text, delay = 900, extra = {}) => {
    setIsTyping(true);
    return new Promise(resolve => {
      scheduleTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, { id: Date.now() + Math.random(), type: 'bot', text, ts: new Date(), ...extra }]);
        resolve();
      }, delay);
    });
  };

  // Up to three tappable venue cards. Dog-friendly picks come from Brucey.
  const addVenueCards = async (picked, { dog = false } = {}) => {
    if (!picked.length) {
      if (dog) await addBotMsg("Brucey couldn't sniff out a dog-friendly spot nearby right now.", 400, { avatar: 'brucey' });
      return;
    }
    if (dog) await addBotMsg(BRUCEY_LINE, 450, { avatar: 'brucey', venues: picked });
    else await addBotMsg(picked.length === 1 ? 'Tap to have a look:' : 'Tap one to have a look:', 450, { venues: picked });
  };

  const suggestFor = (item) => {
    if (!item || item.suggest === false || item.tag === undefined) return Promise.resolve();
    return addVenueCards(suggestVenuesForTag(venues, item.tag, scoreFor), { dog: item.tag === DOG_TAG });
  };

  const openVenue = (venue) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    onOpenVenue?.(venue);
  };

  const fireAction = (actionKey, delay = 400) => {
    scheduleTimeout(() => {
      const fn = actionMap[actionKey];
      if (typeof fn === 'function') fn();
      setHasActed(true);
    }, delay);
  };

  const handleQuickReply = async (reply) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    addUserMsg(reply.text);
    await addBotMsg(reply.response);
    if (reply.action) fireAction(reply.action);
    else {
      // Time-of-day chips filter by their tag, or by sun for lunch.
      scheduleTimeout(() => {
        if (reply.tag) onSetFilters?.([reply.tag]);
        else onFindSunny?.();
        setHasActed(true);
      }, 400);
    }
    await suggestFor(reply);
  };

  const handleFollowUp = async (chip) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    if (chip.resetsChat) {
      setMessages([{ id: Date.now(), type: 'bot', text: buildGreeting(weather), ts: new Date() }]);
      setHasActed(false);
      return;
    }
    addUserMsg(chip.text);
    await addBotMsg('On it! Updating the map for you now.', 700);
    fireAction(chip.action, 300);
    await suggestFor(chip);
    setHasActed(false);
  };

  const askSunny = async (history) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return false;

    let accessToken = anonKey;
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) accessToken = data.session.access_token;
      }
    } catch {
      // Anon JWT is enough for verify_jwt when no session is present.
    }

    setIsTyping(true);
    // sunnyContext is POST-only — never appended to the on-screen transcript.
    const result = await postChatSunny({
      supabaseUrl,
      anonKey,
      accessToken,
      messages: toLlmMessages(history),
      sunnyContext: buildSunnyContext({
        timeOfDay: todMinutes,
        activeVenue: selectedVenue,
        visibleById: byId,
        forecast: venueSunForecast({ venue: CBD, weather: forecastWeather }),
        weather: forecastWeather,
        venues,
        sunMomentsById,
        // "Sunny near 3141?" / "…in South Yarra?": send that place's venues too,
        // and any venue the guest named ("Wonderland bar"), wherever the map is.
        place: withNamedVenues(
          sunnyFocusVenues([...history].reverse().find((m) => m?.type === 'user')?.text, venues),
          venuesNamedInText([...history].reverse().find((m) => m?.type === 'user')?.text, venues),
        ),
      }),
    });
    if (!result.ok) {
      setIsTyping(false);
      const friendly = friendlyChatError(result.error);
      if (!friendly) return false;
      await addBotMsg(friendly, 400);
      return true;
    }

    const parsed = parseChatSunnyResponse(result.payload);
    // panToVenue no longer opens a venue straight away: the venues Sunny
    // names become cards under its reply, and a tap opens one.
    const namedIds = [];
    const notes = applySunnyToolCalls(parsed.toolCalls, {
      setTimeOfDay: setTodMinutes,
      setFilters: onSetFilters,
      panToVenue: (id) => {
        if (!venues.some((v) => String(v?.id) === String(id))) return false;
        namedIds.push(id);
        return true;
      },
    });
    const reply = (parsed.reply || '').trim()
      || (parsed.toolCalls.length ? 'On it — updating the map.' : '');
    if (!reply && notes.length === 0) return false;

    if (reply) await addBotMsg(reply);
    for (const note of notes) await addBotMsg(note, 450);
    const dog = isDogIntent(history[history.length - 1]?.text);
    const picked = resolveSuggestedVenues(namedIds, venues);
    if (picked.length) await addVenueCards(picked, { dog });
    else if (dog) await addVenueCards(suggestVenuesForTag(venues, DOG_TAG, scoreFor), { dog });
    if (parsed.toolCalls.length) setHasActed(true);
    return true;
  };

  const handleFreeText = async (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
    addUserMsg(text);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);

    const history = [...messages, { type: 'user', text }];
    const handled = await askSunny(history);
    if (handled) return;

    const intent = matchIntent(text);
    if (intent) {
      const matched = quickReplies.find(r => r.intent === intent);
      if (matched) {
        await addBotMsg(matched.response);
        fireAction(matched.action);
        await suggestFor(matched);
        return;
      }
    }
    // Fallback — no match / function unavailable
    await addBotMsg("Hmm, I'm not sure about that one! Try one of the quick options below, or ask me about sunny spots, rooftops, dog-friendly, or indoor venues 😊", 1000);
  };

  const fmtTime = (d) => d ? d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.92 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="fixed bottom-24 right-4 z-[999999] w-[360px] max-w-[calc(100vw-2rem)]"
        >
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col" style={{ maxHeight: '85dvh' }}
            role="dialog" aria-labelledby="ss-sunny-chat-title">

            {/* ── Header ── */}
            <div className={`bg-gradient-to-r ${mood.gradient} px-5 py-4 flex items-center justify-between flex-shrink-0`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`h-12 w-12 flex-shrink-0 overflow-hidden rounded-full shadow-sm ring-2 ring-white/50 ${avatar.clay ? 'bg-amber-50' : ''}`}>
                    <img
                      key={avatar.src}
                      src={avatar.src}
                      alt={avatar.alt}
                      width={48}
                      height={48}
                      draggable={false}
                      className={`h-full w-full ${avatar.clay ? 'object-contain p-0.5' : 'object-cover'}`}
                    />
                  </div>
                </div>
                <div>
                  <h3 id="ss-sunny-chat-title" className="text-white font-black text-base tracking-tight leading-none mb-1">Sunny · Weather Guide</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse border border-white/20"></span>
                    <span className="text-white/90 text-xs font-bold uppercase tracking-widest">{mood.label}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors"
                aria-label="Close chat"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* ── Live weather strip ── */}
            {liveWeather.available && (
              <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-3 flex-shrink-0">
                <Thermometer className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-amber-700">
                  {chatTempText(liveWeather) ?? 'Temp unavailable'} · UV {liveWeather.uv ?? 'unavailable'} · Wind {chatWindLabel(weather) ?? 'unavailable'} · Cloud {liveWeather.cloud == null ? 'unavailable' : `${Math.round(liveWeather.cloud)}%`}
                </span>
              </div>
            )}

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white min-h-0"
              role="log" aria-label="Conversation with Sunny">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex max-w-[88%] items-end gap-2">
                    {msg.avatar === 'brucey' ? (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
                        <ClayIcon name="brucey" size={34} alt="Brucey" />
                      </span>
                    ) : null}
                    <div className={`px-5 py-3 rounded-3xl text-[14px] font-medium shadow-sm leading-relaxed ${
                      msg.type === 'user'
                        ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-br-md'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-bl-md'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                  {msg.venues?.length ? (
                    <VenueSuggestionCards venues={msg.venues} statusFor={statusFor} onOpen={openVenue} />
                  ) : null}
                  <span className="text-[10px] text-gray-400 mt-1 px-2">{fmtTime(msg.ts)}</span>
                </motion.div>
              ))}

              <AnimatePresence>
                {isTyping && <TypingIndicator />}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>

            {/* ── Quick replies / follow-ups / input ── */}
            <div className="flex-shrink-0 bg-white border-t border-gray-100">

              {/* Chip row */}
              {!hasActed && (
                <div className="relative px-4 pt-3 pb-1">
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                    {quickReplies.map((reply, i) => (
                      <motion.button
                        key={reply.intent}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.06 }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleQuickReply(reply)}
                        className={chipClass}
                      >
                        <ClayIcon name={reply.icon} size={30} />
                        {reply.text}
                      </motion.button>
                    ))}
                  </div>
                  {/* Fade hint right edge */}
                  <div className="pointer-events-none absolute right-4 top-3 bottom-3 w-8 bg-gradient-to-l from-white to-transparent" />
                </div>
              )}

              {/* Follow-up chips after action */}
              {hasActed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto scrollbar-hide"
                >
                  {followUpChips.map((chip, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.08 }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleFollowUp(chip)}
                      className={chipClass}
                    >
                      <ClayIcon name={chip.icon} size={30} />
                      {chip.text}
                    </motion.button>
                  ))}
                </motion.div>
              )}

              {/* Free-text input */}
              <form onSubmit={handleFreeText} className="flex items-center gap-2 px-4 py-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="Ask Sunny anything..."
                  className="flex-1 min-w-0 h-11 px-4 bg-gray-50 border border-gray-200 rounded-full text-[16px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:bg-white transition-all"
                />
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.93 }}
                  disabled={!inputValue.trim()}
                  className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-gradient-to-r from-amber-400 to-orange-500 rounded-full shadow-md disabled:opacity-40 transition-opacity"
                  aria-label="Send"
                >
                  <Send className="w-4 h-4 text-white" />
                </motion.button>
              </form>
            </div>
          </div>

          {/* Speech bubble arrow */}
          <div className="absolute -bottom-2 right-8 w-4 h-4 bg-white rotate-45 border-r border-b border-gray-100" />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChatWidget;
