import React, { useEffect, useRef } from 'react';
import sunnyDefault from '../assets/sunny-mascot.jpg';

const MASCOT_PX = 48;

// Module-level so a remount is visible in the console without React state.
let debugSunnyMounts = 0;

/**
 * TEMPORARY isolation probe: one static Sunny, no gestures, no drag state.
 * Remove with DEBUG_MASCOT_RENDER.
 */
export default function DebugStaticSunny() {
    const mountCountRef = useRef(0);
    if (mountCountRef.current === 0) {
        debugSunnyMounts += 1;
        mountCountRef.current = debugSunnyMounts;
    }

    useEffect(() => {
        console.info('[DEBUG_MASCOT_RENDER] mount', {
            mountsThisSession: debugSunnyMounts,
            src: sunnyDefault,
        });
        return () => {
            console.info('[DEBUG_MASCOT_RENDER] unmount', {
                mountsThisSession: debugSunnyMounts,
            });
        };
    }, []);

    return (
        <img
            src={sunnyDefault}
            alt=""
            width={MASCOT_PX}
            height={MASCOT_PX}
            data-testid="debug-static-sunny"
            data-debug-mounts={debugSunnyMounts}
            className="pointer-events-none absolute top-2 left-1/2 z-50 h-12 w-12 -translate-x-1/2 rounded-full object-cover"
            draggable={false}
            onLoad={(event) => {
                const { naturalWidth, naturalHeight, currentSrc } = event.currentTarget;
                console.info('[DEBUG_MASCOT_RENDER] decoded', {
                    naturalWidth,
                    naturalHeight,
                    hasVisiblePixels: naturalWidth > 0 && naturalHeight > 0,
                    currentSrc,
                });
            }}
            onError={() => {
                console.error('[DEBUG_MASCOT_RENDER] failed to decode sunnyDefault');
            }}
        />
    );
}

export { sunnyDefault, debugSunnyMounts };
