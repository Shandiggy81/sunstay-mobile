import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SunnyMascot = ({ onClick, isChatOpen }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            className="fixed bottom-6 right-6 z-30"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 15, delay: 0.5 }}
        >
            <motion.button
                onClick={onClick}
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="w-20 h-20 rounded-full shadow-2xl flex items-center justify-center cursor-pointer group relative overflow-hidden"
                animate={{
                    y: isChatOpen ? 0 : [0, -8, 0],
                }}
                transition={{
                    duration: 3,
                    repeat: isChatOpen ? 0 : Infinity,
                    ease: 'easeInOut',
                }}
            >
                {/* Glow effect */}
                <motion.div
                    className={`absolute inset-0 rounded-full blur-xl ${isChatOpen ? 'bg-green-300' : 'bg-yellow-300'
                        }`}
                    animate={{
                        scale: isHovered || isChatOpen ? 1.5 : 1,
                        opacity: isHovered || isChatOpen ? 0.7 : 0.5,
                    }}
                    transition={{ duration: 0.3 }}
                />

                {/* Sunny mascot image */}
                <motion.img
                    src="/assets/sunny-mascot.jpg"
                    alt="Sunny"
                    className={`w-full h-full rounded-full object-cover relative z-10 border-4 ${isChatOpen ? 'border-green-400/70' : 'border-white/50'
                        }`}
                    animate={{
                        rotate: isHovered ? 15 : 0,
                    }}
                    transition={{
                        duration: 0.3,
                        ease: 'easeInOut',
                    }}
                />

                {/* Chat active indicator */}
                {isChatOpen && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center z-20"
                    >
                        <span className="text-white text-xs">💬</span>
                    </motion.div>
                )}
            </motion.button>

            {/* Tooltip - only show when chat is closed */}
            {!isChatOpen && (
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : 20 }}
                    className="absolute right-24 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg whitespace-nowrap pointer-events-none"
                >
                    <p className="text-sm font-semibold text-gray-800">
                        Click to chat with Sunny! 💬
                    </p>
                </motion.div>
            )}
        </motion.div>
    );
};

export default SunnyMascot;
