import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle } from 'lucide-react';

const ChatWidget = ({
    isOpen,
    onClose,
    onFindWheelchair,
    onFindDogFriendly,
    onFindSmoking,
    onSurpriseMe,
    onFindFamily,
    onFindBusiness
}) => {
    const [messages, setMessages] = useState([
        {
            id: 1,
            type: 'bot',
            text: "G'day! I'm Sunny. What kind of spot are you looking for today? 😎",
        }
    ]);
    const [hasActed, setHasActed] = useState(false);

    const handleQuickReply = (action, displayText, responseText) => {
        if (hasActed) return;

        // Add user message
        setMessages(prev => [...prev, {
            id: Date.now(),
            type: 'user',
            text: displayText
        }]);

        // Add bot response after delay
        setTimeout(() => {
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                type: 'bot',
                text: responseText
            }]);

            // Execute the action
            setTimeout(() => {
                action();
                setHasActed(true);
            }, 500);
        }, 600);
    };

    const quickReplies = [
        {
            text: "Where is wheelchair accessible? ♿",
            response: "Great question! Let me filter to wheelchair-friendly venues... 🦽",
            action: onFindWheelchair
        },
        {
            text: "Find me a dog-friendly spot 🐶",
            response: "Woof! Filtering to pet-friendly venues now... 🐕",
            action: onFindDogFriendly
        },
        {
            text: "Pram & Family Friendly? 👶",
            response: "Looking for family-friendly spots! Filtering now... 🍼",
            action: onFindFamily
        },
        {
            text: "Good for Business/Functions? 💼",
            response: "Finding professional spots with space! Filtering... 👔",
            action: onFindBusiness
        },
        {
            text: "Where can I smoke? 🚬",
            response: "No worries! Showing venues with smoking areas... 🌿",
            action: onFindSmoking
        },
        {
            text: "Surprise me! 🎲",
            response: "Love the adventure! Let me pick something special for you... ✨",
            action: onSurpriseMe
        }
    ];

    const resetChat = () => {
        setMessages([{
            id: 1,
            type: 'bot',
            text: "G'day! I'm Sunny. What kind of spot are you looking for today? 😎",
        }]);
        setHasActed(false);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.9 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="fixed bottom-24 right-6 z-[9999] w-[350px] max-w-[calc(100vw-3rem)]"
                >
                    {/* Chat window */}
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-500 px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/50 shadow-md">
                                    <img
                                        src={`${import.meta.env.BASE_URL}assets/sunny-mascot.jpg`}
                                        alt="Sunny"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div>
                                    <h3 className="text-white font-black text-base tracking-tight leading-none mb-1">Sunny · Weather Guide</h3>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse border border-white/20"></span>
                                        <span className="text-white/90 text-xs font-bold uppercase tracking-widest">Available</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors"
                            >
                                <X className="w-6 h-6 text-white" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="h-80 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-gray-50 to-white">
                            {messages.map((message) => (
                                <motion.div
                                    key={message.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} `}
                                >
                                    <div
                                        className={`max-w-[90%] px-6 py-4 rounded-3xl text-[15px] sm:text-base font-medium shadow-sm leading-relaxed ${message.type === 'user'
                                            ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-br-md'
                                            : 'bg-white border border-gray-100 text-gray-800 rounded-bl-md'
                                            } `}
                                    >
                                        {message.text}
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Quick replies & Actions Area */}
                        <div className="p-5 bg-white border-t border-gray-100 shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
                            {!hasActed ? (
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x pt-1">
                                    {quickReplies.map((reply, index) => (
                                        <motion.button
                                            key={index}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: index * 0.08 }}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleQuickReply(reply.action, reply.text, reply.response)}
                                            className="flex-shrink-0 snap-start h-[48px] px-6 bg-white border-2 border-gray-100 rounded-full text-[14px] font-black text-gray-700 hover:border-amber-400 hover:bg-amber-50 shadow-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                                        >
                                            <span>{reply.text}</span>
                                        </motion.button>
                                    ))}
                                </div>
                            ) : (
                                <motion.button
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={resetChat}
                                    className="w-full h-[52px] bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl text-[15px] font-black text-white flex items-center justify-center gap-2 shadow-lg shadow-orange-100"
                                >
                                    <MessageCircle size={18} />
                                    <span>Ask Sunny Again</span>
                                </motion.button>
                            )}
                        </div>
                    </div>

                    {/* Speech bubble arrow */}
                    <div className="absolute -bottom-2 right-8 w-4 h-4 bg-white rotate-45 border-r border-b border-gray-100"></div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ChatWidget;
