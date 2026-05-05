/**
 * storage.js
 * Gestiona toda la persistencia local: favoritos, wishlist, notas, visitados, emoji editado.
 * Clave de almacenamiento: restaurantes_[tipo]
 */

const Storage = (() => {

  const KEY_FAVS    = 'restaurantes_favs';
  const KEY_WISH    = 'restaurantes_wish';
  const KEY_NOTES   = 'restaurantes_notes';
  const KEY_VISITED = 'restaurantes_visited';
  const KEY_EMOJIS  = 'restaurantes_emojis';

  const _load = key => {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  };

  const _save = (key, data) => {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch(e) { console.warn('localStorage error:', e); }
  };

  // ── FAVORITOS ──
  const getFavs    = () => _load(KEY_FAVS);
  const isFav      = id => !!_load(KEY_FAVS)[id];
  const toggleFav  = id => {
    const d = _load(KEY_FAVS);
    if (d[id]) delete d[id]; else d[id] = true;
    _save(KEY_FAVS, d);
    return !!d[id];
  };

  // ── WISHLIST ──
  const getWish    = () => _load(KEY_WISH);
  const isWish     = id => !!_load(KEY_WISH)[id];
  const toggleWish = id => {
    const d = _load(KEY_WISH);
    if (d[id]) delete d[id]; else d[id] = true;
    _save(KEY_WISH, d);
    return !!d[id];
  };

  // ── VISITADOS ──
  const getVisited    = () => _load(KEY_VISITED);
  const isVisited     = id => !!_load(KEY_VISITED)[id];
  const toggleVisited = id => {
    const d = _load(KEY_VISITED);
    if (d[id]) delete d[id]; else d[id] = true;
    _save(KEY_VISITED, d);
    return !!d[id];
  };

  // ── NOTAS ──
  const getNote   = id => (_load(KEY_NOTES)[id] || '');
  const saveNote  = (id, text) => {
    const d = _load(KEY_NOTES);
    if (text.trim()) d[id] = text.trim();
    else delete d[id];
    _save(KEY_NOTES, d);
  };

  // ── EMOJIS EDITADOS ──
  const getEmoji   = id => (_load(KEY_EMOJIS)[id] || null);
  const saveEmoji  = (id, emoji) => {
    const d = _load(KEY_EMOJIS);
    if (emoji) d[id] = emoji; else delete d[id];
    _save(KEY_EMOJIS, d);
  };

  // ── HELPERS ──
  // Devuelve ids de favs/wish para una lista de restaurantes
  const getFavIds  = (restaurantes) => restaurantes.filter(r => isFav(r.id)).map(r => r.id);
  const getWishIds = (restaurantes) => restaurantes.filter(r => isWish(r.id)).map(r => r.id);

  return {
    isFav, toggleFav, getFavs,
    isWish, toggleWish, getWish,
    isVisited, toggleVisited, getVisited,
    getNote, saveNote,
    getEmoji, saveEmoji,
    getFavIds, getWishIds
  };
})();
