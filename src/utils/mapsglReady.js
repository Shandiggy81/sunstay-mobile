/**
 * The Xweather MapsGL controller loads asynchronously after it is created.
 * Adding a weather layer before then throws "Map controller is not
 * initialized", which is why the rain radar never drew. Per the SDK docs,
 * wait for `isReady` or the controller's `load` event first.
 *
 * Resolves with the controller once it is ready; rejects after `timeoutMs`
 * (no retry loop: the next toggle of the radar tries again).
 *
 * @param {{ isReady?: boolean, once?: Function, on?: Function, off?: Function } | null} controller
 * @param {{ timeoutMs?: number }} [options]
 */
export function whenControllerReady(controller, { timeoutMs = 15000 } = {}) {
    if (!controller) return Promise.reject(new Error('No map controller'));
    if (controller.isReady) return Promise.resolve(controller);
    return new Promise((resolve, reject) => {
        let timer;
        const onLoad = () => {
            clearTimeout(timer);
            resolve(controller);
        };
        timer = setTimeout(() => {
            controller.off?.('load', onLoad);
            reject(new Error('Rain radar took too long to load'));
        }, timeoutMs);
        if (typeof controller.once === 'function') controller.once('load', onLoad);
        else controller.on?.('load', onLoad);
    });
}
