const CONTENT_MODNAMES = new Set(['resource', 'folder', 'url']);

function detectFileType(mimetype, filename) {
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

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Transform Moodle core_course_get_contents response into materials structure.
 * @param {Array} sections - Raw Moodle sections
 * @param {string} wstoken - Token to append to direct download URLs
 * @returns {{ sections: Array, totalFiles: number }}
 */
export function transformCourseMaterials(sections, wstoken) {
  let totalFiles = 0;

  const result = (sections || [])
    .filter(s => s.visible !== 0)
    .map(section => {
      const materials = [];

      for (const mod of (section.modules || [])) {
        if (!CONTENT_MODNAMES.has(mod.modname)) continue;
        if (mod.visible === 0) continue;

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

  return { sections: result, totalFiles };
}
