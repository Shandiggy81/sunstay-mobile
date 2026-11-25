import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronRight, Send, X } from 'lucide-react';
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
import { readChatWeather } from '../utils/chatWeather';
import { useWeather } from '../context/WeatherContext';
import { melbourneHourNow } from '../utils/microclimate';
import { venueDisplayScore } from '../utils/venueDisplayScore';
import { venueIcon } from '../utils/clayIcons';
import { sunnyFocusVenues } from '../utils/venueAmenities';
import { sunnyWarmthAnswer } from '../utils/sunnyWarmth';
import { venuesNamedInText, withNamedVenues } from '../utils/venueNameMatch.js';
import { venueSunForecast } from '../utils/venueSun';
import {
  BRUCEY_LINE,
  isDogIntent,
  resolveSuggestedVenues,
  suggestionCardDetails,
  suggestVenuesForTag,
} from '../utils/sunnySuggestions';
import { buildQuickReplies, chipForText, DOG_TAG, SUNNY_CHIPS_SHOWN } from '../utils/sunnyQuickReplies';
import { sunnyGreeting, sunnyWeatherLine } from '../utils/sunnyGreeting';
import './ChatWidget.css';

// Sunny is the clay sun in sunglasses; Thunder Buddy stays for storms.
const SUNNY_AVATAR = { src: clayIconUrl('high-uv'), alt: 'Sunny' };
const CHAT_AVATARS = {
  thunder: { src: thunderBuddy, alt: 'Thunder Buddy' },
  sunny: SUNNY_AVATAR,
  default: SUNNY_AVATAR,
};

// Melbourne CBD: the forecast point for chat context (same as WeatherContext).
const CBD = { lat: -37.8136, lng: 144.9631 };

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

// ─── Venue rows under a reply: name, then type · suburb (no city sun line) ───
const VenueSuggestionRows = ({ venues, onOpen }) => (
  <ul className="ss-sunny-venues" aria-label="Suggested venues" role="list">
    {venues.map((venue) => {
      const { name, subtitle, accessibleName } = suggestionCardDetails(venue);
      return (
        <li key={venue.id}>
          <button
            type="button"
            onClick={() => onOpen(venue)}
            className="ss-sunny-venue"
            aria-label={accessibleName}
          >
            <VenueIcon icon={venueIcon(venue)} size={40} />
            <span className="ss-sunny-venue-copy">
              <span className="ss-sunny-venue-name">{name}</span>
              {/* The space keeps "name" and "type" apart for Label in Name (labelInName.js). */}
              {subtitle && <>{' '}<span className="ss-sunny-venue-subtitle">{subtitle}</span></>}
            </span>
            <ChevronRight size={20} aria-hidden="true" className="ss-sunny-venue-chevron" />
          </button>
        </li>
      );
    })}
  </ul>
);

// ─── Typing indicator ─────────────────────────────────────────────────────────
const TypingIndicator = ({ reducedMotion }) => (
  <div className="ss-sunny-message ss-sunny-typing">
    {[0, 1, 2].map(i => (
      <motion.span key={i} aria-hidden="true"
        animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
    ))}
    <span className="sr-only">Sunny is typing</span>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const ChatWidget = ({
  isOpen,
  onClose,
  returnFocusRef,
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
    onFindFamily,
    onFindBusiness,
    onFindSunny,
    onFindRooftop,
    onFindIndoor,
    onFindWindSheltered,
  };
  const liveWeather = readChatWeather(weather);
  const greeting = sunnyGreeting(weather);
  const weatherLine = sunnyWeatherLine(weather);
  const avatar = CHAT_AVATARS[resolveChatAvatarKind(weather)];
  const reducedMotion = useReducedMotion();
  // Every chip: the first SUNNY_CHIPS_SHOWN are shown, and all of them answer when typed.
  const quickReplies = buildQuickReplies(weather, melbourneHourNow());
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

  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasActed, setHasActed] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const conversationRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const wasOpen = useRef(false);
  const nextMessageId = useRef(0);
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

  // The greeting tracks live weather without clearing an exchange on refresh.
  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setHasActed(false);
      setInputValue('');
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (isOpen) inputRef.current?.focus({ preventScroll: true });
    else if (wasOpen.current) {
      const activeDialog = document.activeElement?.closest('[role="dialog"], [role="alertdialog"]');
      if (!activeDialog || activeDialog === panelRef.current) returnFocusRef?.current?.focus({ preventScroll: true });
    }
    wasOpen.current = isOpen;
  }, [isOpen, returnFocusRef]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (isOpen && conversation) conversation.scrollTo({ top: conversation.scrollHeight, behavior: reducedMotion ? 'instant' : 'smooth' });
  }, [isOpen, messages, isTyping, hasActed, reducedMotion]);

  const addUserMsg = (text) => {
    const message = { id: nextMessageId.current++, type: 'user', text };
    setMessages(prev => [...prev, message]);
  };

  const addBotMsg = (text, delay = 900, extra = {}) => {
    setIsTyping(true);
    return new Promise(resolve => {
      scheduleTimeout(() => {
        setIsTyping(false);
        const message = { id: nextMessageId.current++, type: 'bot', text, ...extra };
        setMessages(prev => [...prev, message]);
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
    else await addBotMsg('', 450, { venues: picked });
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

  // A chip's reply, map action and venue rows: the same for a tap and for a
  // typed ask that matches the chip (chipForText), so neither reaches chat-sunny.
  const answerQuickReply = async (reply) => {
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

  const handleQuickReply = async (reply) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    addUserMsg(reply.text);
    await answerQuickReply(reply);
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

    // Fireplace and outdoor-heater asks are answered from the venue rows, so
    // Sunny only names venues whose records show every feature asked for.
    const warm = sunnyWarmthAnswer(text, venues);
    if (warm) {
      await addBotMsg(warm.reply);
      if (warm.venues.length) await addVenueCards(warm.venues, { dog: warm.dog });
      return;
    }

    // "dog friendly", "any rooftop bars?": a chip's ask in other words gets
    // the chip's answer on the phone, shown or not. Anything more (a venue, a
    // suburb, a time, a second want) goes to chat-sunny.
    const chip = chipForText(text, quickReplies);
    if (chip) {
      await answerQuickReply(chip);
      return;
    }

    const history = [{ type: 'bot', text: greeting }, ...messages, { type: 'user', text }];
    const handled = await askSunny(history);
    if (handled) return;

    // chat-sunny is unavailable: the loose keyword match is the fallback.
    const intent = matchIntent(text);
    if (intent) {
      const matched = quickReplies.find(r => r.intent === intent);
      if (matched) {
        await answerQuickReply(matched);
        return;
      }
    }
    // Fallback — no match / function unavailable
    await addBotMsg("I'm not sure about that one. Try a suggestion below, or ask me about sunny spots, rooftops, dog-friendly or indoor venues.", 1000);
  };

  const handleKeyDown = (event) => {
    if (!isOpen || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  const latestRows = messages.findLastIndex(message => message.venues?.length);
  const mapAction = hasActed && onShowOnMap && (
    <button type="button" className="ss-sunny-map-action" onClick={onShowOnMap}>Show on map</button>
  );

  return createPortal(
    <AnimatePresence>
      {isOpen && <motion.div
        key="backdrop"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, pointerEvents: 'none' }}
        transition={{ duration: reducedMotion ? 0 : 0.22 }}
        onClick={onClose}
        aria-hidden="true"
        className="ss-sunny-backdrop"
      />}
      {isOpen && <motion.div
        key="sheet"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ss-sunny-chat-title"
        className="ss-sunny-sheet"
        initial={reducedMotion ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', pointerEvents: 'none' }}
        transition={reducedMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 200 }}
        onKeyDown={handleKeyDown}
      >
        <div className="ss-sunny-handle" aria-hidden="true"><span /></div>
        <div className="ss-sunny-header">
          <img src={avatar.src} alt={avatar.alt} width={40} height={40} draggable={false} />
          <div className="ss-sunny-heading">
            <h3 id="ss-sunny-chat-title">Ask Sunny</h3>
            {weatherLine && <p>{weatherLine}</p>}
          </div>
          <button type="button" className="ss-sunny-close" onClick={onClose} aria-label="Close chat">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div ref={conversationRef} className="ss-sunny-conversation" role="log" aria-label="Conversation with Sunny" tabIndex={0}>
          <p className="ss-sunny-message">{greeting}</p>
          {messages.map((msg, index) => (
            <div key={msg.id} className={`ss-sunny-message${msg.type === 'user' ? ' ss-sunny-message--guest' : ''}${!msg.text ? ' ss-sunny-message--rows' : ''}`}>
              {msg.text && (msg.avatar === 'brucey' ? (
                <div className="ss-sunny-brucey">
                  <ClayIcon name="brucey" size={34} alt="Brucey" />
                  <p>{msg.text}</p>
                </div>
              ) : <p>{msg.text}</p>)}
              {msg.venues?.length ? <VenueSuggestionRows venues={msg.venues} onOpen={openVenue} /> : null}
              {index === latestRows && mapAction}
            </div>
          ))}
          {isTyping && <TypingIndicator reducedMotion={reducedMotion} />}
          {latestRows < 0 && mapAction}
        </div>

        <div className="ss-sunny-composer">
          <div className="ss-sunny-chips" role="group" aria-label="Quick replies">
            {quickReplies.slice(0, SUNNY_CHIPS_SHOWN).map(reply => (
              <button key={reply.intent} type="button" className="ss-quick-chip ss-chip ss-chip--selectable" onClick={() => handleQuickReply(reply)}>
                <ClayIcon name={reply.icon} size={22} />
                {reply.text}
              </button>
            ))}
          </div>
          <form onSubmit={handleFreeText} className="ss-sunny-form">
            <label htmlFor="ss-sunny-message-input" className="sr-only">Message Sunny</label>
            <input
              id="ss-sunny-message-input"
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={event => setInputValue(event.target.value)}
              placeholder="Ask Sunny anything..."
            />
            <button type="submit" disabled={!inputValue.trim()} className="ss-action ss-action--primary ss-sunny-send" aria-label="Send">
              <Send size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      </motion.div>}
    </AnimatePresence>,
    document.body,
  );
};

export default ChatWidget;
