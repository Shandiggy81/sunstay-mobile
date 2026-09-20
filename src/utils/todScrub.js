export const TOD_SCRUB_DEBOUNCE_MS = 150;

export function resolveTodScrubPublish({ liveMinutes, publishedMinutes } = {}) {
    return {
        sliderMinutes: liveMinutes,
        clusterRebuildMinutes: publishedMinutes,
    };
}
