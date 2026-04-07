import { T2SCHOLA_API } from '../config.js';

/**
 * Generic Moodle REST API caller.
 * Handles array/object parameter serialization for Moodle's format.
 */
export async function callMoodleAPI(wstoken, wsfunction, params = {}) {
  const url = new URL(T2SCHOLA_API);
  url.searchParams.set('wstoken', wstoken);
  url.searchParams.set('wsfunction', wsfunction);
  url.searchParams.set('moodlewsrestformat', 'json');

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === 'object' && v !== null) {
          for (const [k2, v2] of Object.entries(v)) {
            url.searchParams.set(`${key}[${i}][${k2}]`, v2);
          }
        } else {
          url.searchParams.set(`${key}[${i}]`, v);
        }
      });
    } else {
      url.searchParams.set(key, value);
    }
  }

  const resp = await fetch(url.toString());
  const text = await resp.text();

  // LMS がHTML（メンテナンスページやログインリダイレクト）を返した場合を検出
  if (text.startsWith('<') || text.startsWith('<!')) {
    const snippet = text.substring(0, 120).replace(/\s+/g, ' ');
    const err = new Error(`Moodle returned HTML instead of JSON: ${snippet}`);
    err.code = 'MOODLE_HTML_RESPONSE';
    err.status = resp.status;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const snippet = text.substring(0, 120).replace(/\s+/g, ' ');
    const err = new Error(`Moodle response is not valid JSON: ${snippet}`);
    err.code = 'MOODLE_INVALID_JSON';
    throw err;
  }

  if (data.exception) {
    throw new Error(`Moodle API [${data.errorcode}]: ${data.message}`);
  }

  return data;
}
