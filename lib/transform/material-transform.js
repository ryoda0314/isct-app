const CONTENT_MODNAMES = new Set(['resource', 'folder', 'url']);

/**
 * Non-file activities the LMS course page lists alongside the materials
 * (announcements, surveys, notices…). They carry no downloadable file, so they
 * surface as read-only rows that deep-link into the LMS instead.
 * `assign` is deliberately absent: assignments have their own tab and would
 * only be duplicated here.
 */
const ACTIVITY_TYPES = {
  forum: 'forum', hsuforum: 'forum', chat: 'forum',
  feedback: 'survey', questionnaire: 'survey', choice: 'survey', survey: 'survey',
  quiz: 'quiz',
  page: 'page', book: 'page', lesson: 'page',
  label: 'notice',
};
const SKIP_MODNAMES = new Set(['assign']);
const activityType = modname => ACTIVITY_TYPES[modname] || 'activity';

export function detectFileType(mimetype, filename) {
  const mime = (mimetype || '').toLowerCase();
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('presentation') || mime.includes('powerpoint') || ext === 'pptx' || ext === 'ppt') return 'slide';
  if (mime.includes('spreadsheet') || mime.includes('excel') || ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'spreadsheet';
  if (mime.includes('word') || mime.includes('document') || ext === 'docx' || ext === 'doc') return 'document';
  if (ext === 'zip' || ext === 'tar' || ext === 'gz' || ext === 'rar' || ext === '7z') return 'archive';
  if (ext === 'py' || ext === 'c' || ext === 'cpp' || ext === 'java' || ext === 'js' || ext === 'h' || ext === 'rs') return 'code';
  if (ext === 'txt' || ext === 'md' || ext === 'tex' || ext === 'log') return 'text';
  return 'file';
}

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Strip HTML tags from Moodle's availabilityinfo (already localized text). */
function stripTags(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Named HTML entities that actually show up in instructors' course text. */
const ENTITIES = {
  nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'",
  rarr: '→', larr: '←', harr: '↔', darr: '↓', uarr: '↑',
  hellip: '…', mdash: '—', ndash: '–', middot: '・', bull: '•',
  times: '×', deg: '°', yen: '¥', copy: '©', reg: '®', trade: '™',
};

/**
 * Decode HTML entities. `&amp;` is handled last so an escaped entity
 * (`&amp;lt;`) survives as literal text instead of turning into a tag.
 */
function decodeEntities(s) {
  const chr = (m, cp) => {
    try { return String.fromCodePoint(cp); } catch { return m; }  // out-of-range → leave as-is
  };
  return (s || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => chr(m, parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => chr(m, Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/&amp;/g, '&');
}

/** Collapse a Moodle activity name to a single clean line. */
function plainName(name) {
  return decodeEntities((name || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Flatten a Moodle activity description (HTML) to plain text, keeping the line
 * breaks — instructors write multi-line notices there, and collapsing them into
 * one run of text makes them unreadable.
 */
function htmlToText(html) {
  return decodeEntities(
    (html || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t 　]+/g, ' ')   // U+00A0 (decoded &nbsp;) と U+3000 (全角空白) も半角スペースに寄せる
    .split('\n').map(l => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Transform Moodle core_course_get_contents response into materials structure.
 * @param {Array} sections - Raw Moodle sections
 * @param {string} wstoken - Token to append to direct download URLs
 * @returns {{ sections: Array, totalFiles: number, totalActivities: number }}
 */
export function transformCourseMaterials(sections, wstoken) {
  let totalFiles = 0;
  let totalActivities = 0;

  const result = (sections || [])
    .filter(s => s.visible !== 0)
    .map(section => {
      const materials = [];

      for (const mod of (section.modules || [])) {
        if (SKIP_MODNAMES.has(mod.modname)) continue;
        if (mod.visible === 0) continue;
        const isContent = CONTENT_MODNAMES.has(mod.modname);

        // Restricted / not-yet-available: the LMS shows it greyed with an
        // "available from ..." note. Moodle withholds `contents` (no file URLs)
        // for these, so we surface a locked entry using `contentsinfo` for the
        // icon/size and `availabilityinfo` for the note. (visible===1 but the
        // user can't access it yet.)
        if (mod.uservisible === false) {
          const mimetype = mod.contentsinfo?.mimetypes?.[0] || '';
          const fileType = !isContent ? activityType(mod.modname)
            : mod.modname === 'url' ? 'link'
            : detectFileType(mimetype, mod.name);
          materials.push({
            id: `locked_${mod.id}`,
            name: plainName(mod.name),
            filename: null,
            fileurl: '',
            proxyUrl: null,
            filesize: mod.contentsinfo?.filessize || 0,
            filesizeFormatted: formatFileSize(mod.contentsinfo?.filessize),
            mimetype,
            fileType,
            timemodified: mod.contentsinfo?.lastmodified || 0,
            modname: mod.modname,
            kind: isContent ? (mod.modname === 'url' ? 'link' : 'file') : (fileType === 'notice' ? 'notice' : 'activity'),
            locked: true,
            availabilityInfo: stripTags(mod.availabilityinfo),
          });
          continue;
        }

        // Everything that isn't a file/folder/link: announcements, surveys,
        // quizzes, notices… Rendered read-only with the instructor's
        // description, tapping opens the activity's own page in the LMS.
        if (!isContent) {
          const fileType = activityType(mod.modname);
          materials.push({
            id: `mod_${mod.id}`,
            name: plainName(mod.name),
            filename: null,
            fileurl: '',
            proxyUrl: null,
            filesize: null,
            filesizeFormatted: '',
            mimetype: null,
            fileType,
            timemodified: 0,
            modname: mod.modname,
            kind: fileType === 'notice' ? 'notice' : 'activity',
            description: htmlToText(mod.description),
            lmsUrl: mod.url || '',
          });
          totalActivities++;
          continue;
        }

        if (mod.modname === 'url') {
          materials.push({
            id: `mod_${mod.id}`,
            name: mod.name,
            filename: null,
            fileurl: mod.url || (mod.contents?.[0]?.fileurl) || '',
            proxyUrl: null,
            filesize: null,
            filesizeFormatted: '',
            mimetype: null,
            fileType: 'link',
            timemodified: mod.contents?.[0]?.timemodified || 0,
            modname: 'url',
            kind: 'link',
            description: htmlToText(mod.description),
          });
          totalFiles++;
          continue;
        }

        for (const content of (mod.contents || [])) {
          if (content.type !== 'file') continue;
          const rawUrl = content.fileurl || '';
          const dlUrl = rawUrl
            ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}token=${wstoken}`
            : '';
          const proxyUrl = rawUrl
            ? `/api/data/materials/proxy?url=${encodeURIComponent(rawUrl)}`
            : '';
          materials.push({
            id: `file_${mod.id}_${content.filename}`,
            name: mod.name,
            filename: content.filename,
            fileurl: dlUrl,
            proxyUrl,
            filesize: content.filesize || 0,
            filesizeFormatted: formatFileSize(content.filesize),
            mimetype: content.mimetype || '',
            fileType: detectFileType(content.mimetype, content.filename),
            timemodified: content.timemodified || 0,
            modname: mod.modname,
            kind: 'file',
          });
          totalFiles++;
        }
      }

      return {
        id: section.id,
        name: section.name || `Section ${section.id}`,
        materials,
      };
    })
    .filter(s => s.materials.length > 0);

  return { sections: result, totalFiles, totalActivities };
}
