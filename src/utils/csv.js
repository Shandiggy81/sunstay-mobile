/**
 * Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, commas and line
 * breaks inside quotes, CRLF or LF. Returns one object per row keyed by the
 * header row. Used by build scripts; not shipped to the browser.
 *
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
export function parseCsv(text) {
    const records = [];
    let field = '';
    let record = [];
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
            } else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { record.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            record.push(field); field = '';
            if (record.length > 1 || record[0] !== '') records.push(record);
            record = [];
        } else field += ch;
    }
    if (field !== '' || record.length) { record.push(field); records.push(record); }
    const [header = [], ...rows] = records;
    return rows.map(values => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ''])));
}
