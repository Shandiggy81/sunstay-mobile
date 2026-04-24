import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Send, Sun, Cloud, CloudRain, Wind, Thermometer } from 'lucide-react';

// ─── Weather helpers ───────────────────────────────────────────────────────────
const getWeatherMood = (weather) => {
  if (!weather) return { emoji: '😎', label: 'Ready to help', gradient: 'from-amber-400 via-orange-400 to-yellow-500' };
  const temp = weather.current?.temp ?? 20;
  const cloud = weather.current?.cloudCover ?? 0;
  const wind = weather.current?.windSpeed ?? 0;
  const uv = weather.current?.uvIndex ?? 0;
  const code = weather.current?.weatherCode ?? 0;
  const isRain = code >= 500 && code < 600;
  if (isRain) return { emoji: '🌧️', label: 'Rainy day mode', gradient: 'from-slate-400 via-blue-400 to-slate-500' };
  if (wind > 30) return { emoji: '💨', label: 'Windy out there!', gradient: 'from-teal-400 via-cyan-400 to-blue-400' };
  if (uv >= 8) return { emoji: '🕶️', label: 'UV is high today', gradient: 'from-orange-500 via-red-400 to-orange-400' };
  if (cloud > 70) return { emoji: '☁️', label: 'Cloudy vibes', gradient: 'from-gray-400 via-slate-400 to-gray-500' };
  if (temp >= 28) return { emoji: '🌞', label: 'Cracking day!', gradient: 'from-yellow-400 via-amber-400 to-orange-400' };
  return { emoji: '😎', label: 'Great day out', gradient: 'from-amber-400 via-orange-400 to-yellow-500' };
};

const buildGreeting = (weather) => {
  if (!weather) return "G'day! I'm Sunny ☀️ Tell me what kind of spot you're after today!";
  const temp = weather.current?.temp ?? 20;
  const cloud = weather.current?.cloudCover ?? 0;
  const wind = weather.current?.windSpeed ?? 0;
  const uv = weather.current?.uvIndex ?? 0;
  const code = weather.current?.weatherCode ?? 0;
  const isRain = code >= 500 && code < 600;
  if (isRain) return `G'day! It's ${temp}°C and raining out there right now 🌧️ Let me find you a cosy indoor spot — what kind of vibe are you after?`;
  if (uv >= 8) return `G'day! UV is sitting at ${uv} right now ☀️ Pretty intense — I'd recommend shaded or covered venues. What are you after?`;
  if (wind > 30) return `G'day! It's ${temp}°C but pretty windy at ${Math.round(wind)}km/h 💨 Wind-sheltered spots are the move today. What sounds good?`;
  if (cloud > 70) return `G'day! It's ${temp}°C and overcast today ☁️ Perfect weather for a cosy indoor or covered spot. What kind of venue are you after?`;
  if (temp >= 26) return `G'day! It's a beautiful ${temp}°C and sunny out right now ☀️ Perfect rooftop weather! What kind of spot are you looking for?`;
  return `G'day! I'm Sunny — it's ${temp}°C out there right now 😎 What kind of venue are you after today?`;
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
  const code = weather?.current?.weatherCode ?? 0;
  const isRain = code >= 500 && code < 600;
  const uv = weather?.current?.uvIndex ?? 'moderate';
  const wind = weather?.current?.windSpeed ?? 0;

  const all = [
    { intent: 'sunny',      text: '☀️ Sunny outdoor spots',          response: `Ripper! UV's at ${uv} right now — showing venues with the best sun exposure. ☀️`,          action: 'onFindSunny' },
    { intent: 'cloudy',     text: '🌥️ Covered & cosy venues',        response: `Smart move — filtering to shaded and covered spots near you right now. 🌥️`,                action: 'onFindIndoor' },
    { intent: 'wind',       text: '💨 Wind-sheltered areas',          response: `Yeah it's blowy out there! Pulling up the most protected outdoor spots. 💨`,                action: 'onFindWindSheltered' },
    { intent: 'indoor',     text: '🌧️ Rainy day indoor picks',        response: `Staying dry — good call! Loading covered and shaded venues near you now. 🌧️`,              action: 'onFindIndoor' },
    { intent: 'rooftop',    text: '🔥 Rooftop bars right now',        response: `Rooftops incoming! The Emerson and Good Heavens are looking quality right now. 🔥`,         action: 'onFindRooftop' },
    { intent: 'dog',        text: '🐶 Dog-friendly spots',            response: "Bring the pup! Filtering to dog-friendly venues now... 🐾",                                action: 'onFindDogFriendly' },
    { intent: 'family',     text: '👨‍👩‍👧 Family-friendly venues',        response: "Family outing! Finding the best family-friendly spots near you... 👨‍👩‍👧",                    action: 'onFindFamily' },
    { intent: 'business',   text: '💼 Good spots to work from',       response: "Work mode! Finding venues with great vibes for getting things done... 💼",                 action: 'onFindBusiness' },
    { intent: 'accessible', text: '♿ Wheelchair accessible',         response: "On it! Filtering to fully accessible venues near you... ♿",                               action: 'onFindWheelchair' },
    { intent: 'smoking',    text: '🚬 Smoking-friendly areas',        response: "Got it! Showing venues with designated outdoor smoking areas... 🚬",                       action: 'onFindSmoking' },
    { intent: 'surprise',   text: '🎲 Surprise me!',                  response: "Ooh, adventurous! Picking the best weather-matched venue for you right now... 🎲",         action: 'onSurpriseMe' },
  ];

  // Surface weather-contextual suggestions first
  let ordered = [...all];
  if (isRain) ordered = [all.find(r => r.intent === 'indoor'), ...all.filter(r => r.intent !== 'indoor')];
  else if (uv >= 8) ordered = [all.find(r => r.intent === 'cloudy'), ...all.filter(r => r.intent !== 'cloudy')];
  else if (wind > 30) ordered = [all.find(r => r.intent === 'wind'), ...all.filter(r => r.intent !== 'wind')];
  else ordered = [all.find(r => r.intent === 'sunny'), all.find(r => r.intent === 'rooftop'), ...all.filter(r => !['sunny','rooftop'].includes(r.intent))];

  return ordered.filter(Boolean);
};

// ─── Follow-up chips shown after an action ────────────────────────────────────
const followUpChips = [
  { text: '🔄 Try a different vibe', resetsChat: true },
  { text: '🗺️ Show me on the map',   resetsChat: false, action: 'onSurpriseMe' },
  { text: '🐶 Dog-friendly only',    resetsChat: false, action: 'onFindDogFriendly' },
  { text: '♿ Accessible venues',    resetsChat: false, action: 'onFindWheelchair' },
];

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
  const mood = getWeatherMood(weather);
  const quickReplies = buildQuickReplies(weather);

  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasActed, setHasActed] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Reset & seed greeting when opened
  useEffect(() => {
    if (isOpen) {
      setMessages([{ id: 1, type: 'bot', text: buildGreeting(weather), ts: new Date() }]);
      setHasActed(false);
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const addUserMsg = (text) => {
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', text, ts: new Date() }]);
  };

  const addBotMsg = (text, delay = 900) => {
    setIsTyping(true);
    return new Promise(resolve => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, { id: Date.now(), type: 'bot', text, ts: new Date() }]);
        resolve();
      }, delay);
    });
  };

  const fireAction = (actionKey, delay = 400) => {
    setTimeout(() => {
      const fn = actionMap[actionKey];
      if (typeof fn === 'function') fn();
      setHasActed(true);
    }, delay);
  };

  const handleQuickReply = async (reply) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    addUserMsg(reply.text);
    await addBotMsg(reply.response);
    fireAction(reply.action);
  };

  const handleFollowUp = async (chip) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    if (chip.resetsChat) {
      setMessages([{ id: Date.now(), type: 'bot', text: buildGreeting(weather), ts: new Date() }]);
      setHasActed(false);
      return;
    }
    addUserMsg(chip.text);
    await addBotMsg("On it! Updating the map for you now... 🗺️", 700);
    fireAction(chip.action, 300);
    setHasActed(false);
  };

  const handleFreeText = async (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
    addUserMsg(text);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);

    const intent = matchIntent(text);
    if (intent) {
      const matched = quickReplies.find(r => r.intent === intent);
      if (matched) {
        await addBotMsg(matched.response);
        fireAction(matched.action);
        return;
      }
    }
    // Fallback — no match
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
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col" style={{ maxHeight: '85vh' }}>

            {/* ── Header ── */}
            <div className={`bg-gradient-to-r ${mood.gradient} px-5 py-4 flex items-center justify-between flex-shrink-0`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/50 shadow-md">
                    <img src="/sunny-chatbot.png" alt="Sunny" className="w-full h-full object-cover" />
                  </div>
                  <motion.span
                    className="absolute -bottom-0.5 -right-0.5 text-base leading-none"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                  >
                    {mood.emoji}
                  </motion.span>
                </div>
                <div>
                  <h3 className="text-white font-black text-base tracking-tight leading-none mb-1">Sunny · Weather Guide</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse border border-white/20"></span>
                    <span className="text-white/90 text-xs font-bold uppercase tracking-widest">{mood.label}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors"
                aria-label="Close chat"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* ── Live weather strip ── */}
            {weather?.current && (
              <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-3 flex-shrink-0">
                <Thermometer className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-amber-700">
                  {weather.current.temp}°C · UV {weather.current.uvIndex} · Wind {Math.round(weather.current.windSpeed)}km/h · Cloud {weather.current.cloudCover}%
                </span>
              </div>
            )}

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white min-h-0">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[88%] px-5 py-3 rounded-3xl text-[14px] font-medium shadow-sm leading-relaxed ${
                    msg.type === 'user'
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-br-md'
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-md'
                  }`}>
                    {msg.text}
                  </div>
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
                        key={i}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.06 }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleQuickReply(reply)}
                        className="flex-shrink-0 snap-start h-9 px-4 bg-white border border-gray-200 rounded-full text-[12px] font-semibold text-gray-700 hover:border-amber-400 hover:bg-amber-50 shadow-sm transition-all whitespace-nowrap"
                      >
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
                      className="flex-shrink-0 h-9 px-4 bg-white border border-gray-200 rounded-full text-[12px] font-semibold text-gray-700 hover:border-amber-400 hover:bg-amber-50 shadow-sm transition-all whitespace-nowrap"
                    >
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
                  className="flex-1 h-10 px-4 bg-gray-50 border border-gray-200 rounded-full text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:bg-white transition-all"
                />
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.93 }}
                  disabled={!inputValue.trim()}
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-gradient-to-r from-amber-400 to-orange-500 rounded-full shadow-md disabled:opacity-40 transition-opacity"
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
