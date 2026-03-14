import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

const CARD_KEY = "myCard";       // what I carry
const INBOX_KEY = "cardInbox";   // received cards (unopened)
const COLL_KEY = "cardCollection"; // opened cards
const COOLDOWN = 30 * 60 * 1000;  // same person cooldown 30min

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/**
 * すれ違い通信 hook.
 *
 * Each user carries a "card" (course tip / past-exam hint / campus secret).
 * When two users are at the same spot, they automatically exchange cards.
 * Received cards arrive sealed — you open them for the surprise.
 */
export function useEncounter(user, mySpotId, enabled = true) {
  const [myCard, setMyCardRaw] = useState(() => load(CARD_KEY, null));
  const [inbox, setInbox] = useState(() => load(INBOX_KEY, []));
  const [collection, setCollection] = useState(() => load(COLL_KEY, []));
  const [nearby, setNearby] = useState([]);
  const channelRef = useRef(null);
  const cardRef = useRef(myCard);
  cardRef.current = myCard;

  const uid = user?.moodleId || user?.id;

  // persist
  useEffect(() => { save(CARD_KEY, myCard); }, [myCard]);
  useEffect(() => { save(INBOX_KEY, inbox); }, [inbox]);
  useEffect(() => { save(COLL_KEY, collection); }, [collection]);

  const setMyCard = useCallback((card) => {
    setMyCardRaw(card);
    cardRef.current = card;
    // re-track with new card data
    if (channelRef.current && uid && mySpotId) {
      channelRef.current.track({
        id: uid,
        name: user?.name || '',
        col: user?.col || '#888',
        spot: mySpotId,
        card: card ? { type: card.type, courseCode: card.courseCode, courseName: card.courseName, title: card.title, body: card.body, coursCol: card.coursCol } : null,
      });
    }
  }, [uid, mySpotId, user?.name, user?.col]);

  // presence channel
  useEffect(() => {
    if (!enabled || !uid || !mySpotId) {
      setNearby([]);
      return;
    }

    const supabase = getSupabaseClient();
    const channel = supabase.channel('encounter:global', {
      config: { presence: { key: String(uid) } },
    });

    const syncPresence = () => {
      const state = channel.presenceState();
      const same = [];
      const now = Date.now();
      for (const [_key, entries] of Object.entries(state)) {
        for (const entry of entries) {
          if (String(entry.id) === String(uid)) continue;
          if (entry.spot === mySpotId && mySpotId !== '' && mySpotId !== 'home_loc') {
            same.push({
              id: entry.id, name: entry.name, col: entry.col,
              spot: entry.spot, card: entry.card || null,
            });
          }
        }
      }
      setNearby(same);

      // exchange cards
      const curCard = cardRef.current;
      if (same.length > 0 && curCard) {
        setInbox(prev => {
          let next = [...prev];
          let changed = false;
          for (const u of same) {
            if (!u.card) continue;
            // cooldown: same person
            const isDup = next.some(c =>
              c.from.id === String(u.id) && (now - c.receivedAt) < COOLDOWN
            ) || (load(COLL_KEY, [])).some(c =>
              c.from.id === String(u.id) && (now - c.receivedAt) < COOLDOWN
            );
            if (!isDup) {
              next.push({
                id: `${u.id}-${now}`,
                ...u.card,
                from: { id: String(u.id), name: u.name, col: u.col },
                spot: mySpotId,
                receivedAt: now,
                opened: false,
              });
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const c = cardRef.current;
          await channel.track({
            id: uid,
            name: user.name || '',
            col: user.col || '#888',
            spot: mySpotId,
            card: c ? { type: c.type, courseCode: c.courseCode, courseName: c.courseName, title: c.title, body: c.body, coursCol: c.coursCol } : null,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [uid, mySpotId, enabled]);

  // re-track when spot changes
  useEffect(() => {
    if (channelRef.current && uid && mySpotId) {
      const c = cardRef.current;
      channelRef.current.track({
        id: uid,
        name: user?.name || '',
        col: user?.col || '#888',
        spot: mySpotId,
        card: c ? { type: c.type, courseCode: c.courseCode, courseName: c.courseName, title: c.title, body: c.body, coursCol: c.coursCol } : null,
      });
    }
  }, [mySpotId]);

  // open a card (move from inbox to collection)
  const openCard = useCallback((cardId) => {
    setInbox(prev => {
      const card = prev.find(c => c.id === cardId);
      if (!card) return prev;
      setCollection(col => [...col, { ...card, opened: true }]);
      return prev.filter(c => c.id !== cardId);
    });
  }, []);

  const clearCollection = useCallback(() => {
    setCollection([]);
    save(COLL_KEY, []);
  }, []);

  // stats
  const uniquePeople = new Set([...inbox, ...collection].map(c => c.from?.id)).size;
  const totalCards = inbox.length + collection.length;
  const uniqueCourses = new Set([...inbox, ...collection].map(c => c.courseCode).filter(Boolean)).size;

  return {
    nearby,
    myCard,
    setMyCard,
    inbox,
    collection,
    openCard,
    clearCollection,
    stats: { uniquePeople, totalCards, uniqueCourses, unopened: inbox.length },
  };
}
