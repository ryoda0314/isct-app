// Anonymous posts must never carry the author's identity in ANY response.
// (like/react and the bookmark list used to return the raw row, which exposed
// moodle_user_id + profiles.name of anonymous authors to every reader.)
export function stripAnonAuthor(post) {
  if (!post || post.type !== 'anon') return post;
  return { ...post, moodle_user_id: null, profiles: { name: '匿名', avatar: '?', color: '#888' } };
}
