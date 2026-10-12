/**
 * Xweather's MapsGL `Account` needs a client ID and a client secret. SunStay
 * ships one env value; Xweather hands these out joined as `ID_SECRET` (the
 * same form its tile URLs use). Passing the joined string as the ID alone
 * made every radar request fail, so split it here.
 *
 * Accepts, in order: separate id + secret values, `ID:SECRET`, or `ID_SECRET`
 * split at the first underscore. Returns null when no usable pair exists.
 */
export function parseXweatherCredentials(combined, separateId = '', separateSecret = '') {
    const id = String(separateId || '').trim();
    const secret = String(separateSecret || '').trim();
    if (id && secret) return { id, secret };

    const raw = String(combined || '').trim();
    if (!raw) return null;
    for (const sep of [':', '_']) {
        const at = raw.indexOf(sep);
        if (at > 0 && at < raw.length - 1) {
            return { id: raw.slice(0, at), secret: raw.slice(at + 1) };
        }
    }
    return null;
}
