/**
 * Mi Gastro — app.js v5b
 */

window.MAPS_API_KEY = 'AIzaSyAC7drA3_1vuz5cLiAcHSIWg-EoVf8YDFM';

const State = {
  allRests: [], ciudades: {}, currentCiudad: null,
  filters: { query:'', chips:[], barrio:null, cocina:null, precio:null, favOnly:false, soloAbiertos:false },
  sort: 'proximidad',
  userLat: null, userLng: null,
  currentView: 'lista',
  fichaId: null,
  favTab: 'favs',
};

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── DATOS ──
async function loadData() {
  const sources = [
    { path:'data/brasil/rio-de-janeiro/restaurantes.json', ciudad:'Río de Janeiro', region:'Río de Janeiro', pais:'Brasil' },
    { path:'data/brasil/bahia/salvador-de-bahia/restaurantes.json', ciudad:'Salvador de Bahía', region:'Bahía', pais:'Brasil' },
    { path:'data/espana/pais-vasco/bilbao/restaurantes.json', ciudad:'Bilbao', region:'País Vasco', pais:'España' },
  ];

  // Cargar todas las ciudades en paralelo
  const results = await Promise.allSettled(
    sources.map(s =>
      fetch(s.path)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => ({ ...s, data }))
    )
  );

  results.forEach(res => {
    if (res.status !== 'fulfilled') {
      console.warn('Error cargando ciudad:', res.reason);
      return;
    }
    const { pais, region, ciudad, data } = res.value;
    const key = `${pais}/${region}/${ciudad}`;
    State.ciudades[key] = data;
    State.allRests.push(...data);
  });

  // Restaurantes añadidos por el usuario
  try {
    JSON.parse(localStorage.getItem('gastro_user')||'[]').forEach(r => {
      State.allRests.push(r);
      const key = `${r.pais}/${r.region}/${r.municipio}`;
      if (!State.ciudades[key]) State.ciudades[key] = [];
      State.ciudades[key].push(r);
    });
  } catch(e) {}

  if (Object.keys(State.ciudades).length > 0)
    State.currentCiudad = Object.keys(State.ciudades)[0];
}

const getCurrent = () =>
  State.currentCiudad ? (State.ciudades[State.currentCiudad]||[]) : State.allRests;

// ── OVERRIDES DE DATOS (edición inline de fichas) ──
const Overrides = (() => {
  const KEY = 'gastro_overrides';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)||'{}'); } catch(e) { return {}; } };
  const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));

  const get = (id) => load()[id] || {};
  const set = (id, fields) => {
    const all = load();
    all[id] = { ...(all[id]||{}), ...fields };
    save(all);
  };
  return { get, set };
})();

// Aplica overrides encima del restaurante original
function applyOverrides(r) {
  const ov = Overrides.get(r.id);
  if (!Object.keys(ov).length) return r;
  return { ...r, ...ov,
    tags: ov.tags !== undefined ? ov.tags : r.tags,
  };
}

// ── SORT ──
const SORT_CYCLE  = ['proximidad','rating','votos'];
const SORT_LABELS = { proximidad:'↕ Más cercanos', rating:'↕ Mejor rating', votos:'↕ Más valorados' };

function sortedList(list) {
  const arr = [...list];
  if (State.sort === 'rating') return arr.sort((a,b) => (b.rating||0)-(a.rating||0));
  if (State.sort === 'votos')  return arr.sort((a,b) => (b.votos||0)-(a.votos||0));
  if (State.sort === 'proximidad' && State.userLat != null) {
    return arr.sort((a,b) =>
      dist(State.userLat, State.userLng, a.coordenadas?.lat||0, a.coordenadas?.lng||0) -
      dist(State.userLat, State.userLng, b.coordenadas?.lat||0, b.coordenadas?.lng||0)
    );
  }
  return arr;
}

function dist(la1,lo1,la2,lo2) {
  const R=6371, dLa=(la2-la1)*Math.PI/180, dLo=(lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function formatDist(km) {
  if (km < 1) return `${Math.round(km*1000)}m`;
  return `${km.toFixed(1)}km`;
}

// Devuelve array de cocinas — compatible con string antiguo y array nuevo
function getCocinas(r) {
  const ov = Overrides.get(r.id);
  const raw = ov.cocinas !== undefined ? ov.cocinas
    : (r.cocinas || (r.tipo_cocina ? [r.tipo_cocina] : []));
  return Array.isArray(raw) ? raw : [raw];
}

function cyclSort() {
  const idx = SORT_CYCLE.indexOf(State.sort);
  State.sort = SORT_CYCLE[(idx+1) % SORT_CYCLE.length];
  $('sort-btn').textContent = SORT_LABELS[State.sort];
  if (State.sort === 'proximidad' && State.userLat == null) {
    requestLocation();
  } else {
    renderLista();
  }
}

// ── SUGERENCIA AÑADIR ──
// Siempre visible en la barra inferior de la top nav
// Se activa visualmente cuando hay búsqueda sin resultados
function updateAddSuggestion(totalResults) {
  const hasQuery = State.filters.query.trim().length > 0;
  const el = $('add-suggestion');
  if (!hasQuery) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const txt = $('add-suggestion-text');
  if (totalResults === 0) {
    txt.textContent = '¿No está en tu lista?';
    txt.style.color = 'var(--text2)';
  } else {
    txt.textContent = '¿No encuentras lo que buscas?';
    txt.style.color = 'var(--text3)';
  }
}

// ── RENDER LISTA ──
function renderLista() {
  let items = Filters.apply(getCurrent(), State.filters, Storage);
  items = sortedList(items);

  $('results-count').textContent = `${items.length} restaurante${items.length!==1?'s':''}`;
  updateAddSuggestion(items.length);

  const list = $('cards-list');
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🍽️</div>
      <div class="empty-title">Sin resultados</div>
      <div class="empty-sub">Prueba otros filtros o añádelo desde Google Maps</div>
    </div>`;
    return;
  }

  list.innerHTML = items.map((r,i) => buildCard(r,i)).join('');
  bindCards(list);
}

function buildCard(r, i) {
  const st    = Filters.getOpenStatus(r);
  const fav   = Storage.isFav(r.id);
  const wish  = Storage.isWish(r.id);
  const vis   = Storage.isVisited(r.id);
  const emoji = Storage.getEmoji(r.id) || r.emoji || '🍽️';
  const extras = [
    r.picar        ? '<span class="tag picar">🍢 picar</span>' : '',
    r.menu_del_dia ? '<span class="tag menu">📋 menú</span>'   : '',
  ].join('');

  return `<div class="rest-card${r.origen==='usuario'?' user-added':''}${vis?' visited':''}"
    data-id="${r.id}" style="animation-delay:${Math.min(i*25,200)}ms">
    <div class="card-emoji-box">${emoji}<div class="visited-dot"></div></div>
    <div class="card-body">
      <div class="card-top">
        <span class="card-name">${r.nombre}</span>
        <div class="card-actions">
          <button class="card-wish-btn${wish?' active':''}" title="Quiero ir">⊕</button>
          <button class="card-fav-btn${fav?' active':''}" title="Favorito">♥</button>
        </div>
      </div>
      <div class="card-badges">
        <span class="badge">${r.barrio}</span>
        ${(() => { const cs = getCocinas(r); return cs[0] ? `<span class="badge">${cs[0]}${cs.length>1?` <span class="badge-plus">+${cs.length-1}</span>`:''}</span>` : ''; })()}
        <span class="badge price">${r.precio}</span>
        <span class="badge ${st.open?'open':'closed'}">${st.label}</span>
        ${State.userLat != null && r.coordenadas?.lat ? `<span class="badge dist">${formatDist(dist(State.userLat, State.userLng, r.coordenadas.lat, r.coordenadas.lng))}</span>` : ''}
      </div>
      <div class="card-rating">
        <span class="star">★</span>
        <strong>${r.rating}</strong>
        <span style="color:var(--text3)"> · ${(r.votos||0).toLocaleString()} reseñas</span>
      </div>
      <div class="card-desc">${r.descripcion||''}</div>
      <div class="card-tags">
        ${(r.tags||[]).slice(0,3).map(t=>`<span class="tag">${t}</span>`).join('')}
        ${extras}
      </div>
    </div>
  </div>`;
}

function bindCards(container) {
  container.querySelectorAll('.rest-card').forEach(el => {
    const id = el.dataset.id;
    el.addEventListener('click', e => {
      if (e.target.closest('.card-fav-btn') || e.target.closest('.card-wish-btn')) return;
      openFicha(id);
    });
    el.querySelector('.card-fav-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleFav(id); });
    el.querySelector('.card-wish-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleWish(id); });
  });
}

// ── FICHA ──
function openFicha(id) {
  const r = State.allRests.find(x => x.id === id);
  if (!r) return;
  State.fichaId = id;
  fillFicha(r);
  // Resetear scroll ANTES de mostrar la ficha — cubre todos los casos
  $('ficha-scroll').scrollTop = 0;
  $('ficha-view').classList.add('open');
  // Segundo reset tras el frame de render, por si Android lo ignora
  requestAnimationFrame(() => { $('ficha-scroll').scrollTop = 0; });
}
function closeFicha() {
  const prevId = State.fichaId;
  $('ficha-view').classList.remove('open');
  $('ficha-scroll').scrollTop = 0; // reset al cerrar para que la próxima apertura empiece arriba
  State.fichaId = null;
  // Si venimos del mapa, resaltar el marcador del restaurante que veíamos
  if (State.currentView === 'mapa' && prevId && mapReady) {
    setTimeout(() => Maps.highlightMarker(prevId), 150);
  }
}

function fillFicha(r) {
  r = applyOverrides(r);
  const st  = Filters.getOpenStatus(r);
  const fav = Storage.isFav(r.id), wish = Storage.isWish(r.id), vis = Storage.isVisited(r.id);
  const DAYS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const today = new Date().getDay();

  $('ficha-emoji').textContent = Storage.getEmoji(r.id) || r.emoji || '🍽️';
  $('ficha-fav-btn').className  = `ficha-icon-btn${fav  ? ' fav-on'  : ''}`;
  $('ficha-fav-btn').textContent = fav ? '♥' : '♡';
  $('ficha-wish-btn').className  = `ficha-icon-btn${wish ? ' wish-on' : ''}`;

  $('ficha-name').textContent = r.nombre;
  const rCocinas = getCocinas(r);
  $('ficha-badges').innerHTML = `
    <span class="badge">${r.barrio}</span>
    ${rCocinas.map(c => `<span class="badge">${c}</span>`).join('')}
    <span class="badge price">${r.precio}</span>
    <span class="badge ${st.open?'open':'closed'}">${st.label}</span>
  `;
  $('ficha-rating').textContent = r.rating || '–';
  $('ficha-votes').textContent = r.votos ? `· ${r.votos.toLocaleString()} reseñas en Google` : '';

  const url = r.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${r.google_place_id}`
    : `https://www.google.com/maps/search/${encodeURIComponent((r.nombre||'')+' '+(r.barrio||''))}`;
  $('ficha-maps-btn').onclick = () => window.open(url, '_blank');

  $('ficha-desc').textContent = r.descripcion || '';
  $('ficha-platos').innerHTML = (r.platos_destacados||[]).map(p=>`<span class="tag">${p}</span>`).join('');
  $('ficha-horario').innerHTML = DAYS.map((d,i) => {
    const s = r.horario?.[d], isT = i === today;
    return `<div class="horario-row${isT?' today':''}">
      <span class="horario-day">${d[0].toUpperCase()+d.slice(1)}</span>
      <span>${s ? `${s.abre} – ${s.cierra}` : '<span class="horario-cerrado">Cerrado</span>'}</span>
    </div>`;
  }).join('');

  $('ficha-tip').textContent = r.tip_local || '';
  $('ficha-tip-section').style.display = r.tip_local ? 'block' : 'none';
  $('ficha-review').textContent = r.resena_destacada ? `"${r.resena_destacada}"` : '';
  $('ficha-review-section').style.display = r.resena_destacada ? 'block' : 'none';

  $('check-visited').classList.toggle('active', vis);
  $('check-picar').classList.toggle('active', !!r.picar);
  $('check-menu').classList.toggle('active', !!r.menu_del_dia);
  $('ficha-notes').value = Storage.getNote(r.id);
  $('notes-save-btn').classList.remove('visible');
  $('ficha-wsp-btn').onclick = () => shareWhatsApp(r);

  // Panel edición inline (incluye botón eliminar para restaurantes de usuario)
  renderEditPanel(r);
}

function renderEditPanel(r) {
  const ov = Overrides.get(r.id);
  const barrio   = ov.barrio      !== undefined ? ov.barrio      : r.barrio;
  const cocinaArr = ov.cocinas !== undefined ? ov.cocinas
    : (r.cocinas || (r.tipo_cocina ? [r.tipo_cocina] : []));
  const cocinaArr2 = Array.isArray(cocinaArr) ? cocinaArr : [cocinaArr];
  const precio   = ov.precio      !== undefined ? ov.precio      : r.precio;
  const tags     = ov.tags        !== undefined ? ov.tags        : (r.tags || []);
  const picar    = ov.picar       !== undefined ? ov.picar       : !!r.picar;
  const menu     = ov.menu_del_dia!== undefined ? ov.menu_del_dia: !!r.menu_del_dia;

  // Opciones de barrio y cocina de la ciudad activa
  const ciudadRests = getCurrent();
  const barrios = [...new Set(ciudadRests.map(x => x.barrio).filter(Boolean))].sort();
  const cocinas = [...new Set(ciudadRests.flatMap(x => {
    const c = x.cocinas || (x.tipo_cocina ? [x.tipo_cocina] : []);
    return Array.isArray(c) ? c : [c];
  }).filter(Boolean))].sort();

  const TOGGLES = [
    { key:'muy local', label:'Muy local' },
    { key:'desayuno',  label:'Desayuno' },
    { key:'vistas',    label:'Vistas' },
    { key:'nocturno',  label:'Nocturno' },
  ];

  // Emoji picker data — categorías de food & drink
  const EMOJI_CATS = {
    'comida': ['🍽️','🥘','🍲','🥗','🥙','🌮','🌯','🥪','🍱','🍛','🍜','🍝','🍠','🥫','🧆','🧇','🥞','🧈','🍳','🥚','🧀','🥩','🍗','🍖','🥓','🌭','🍔','🍟','🍕'],
    'mariscos': ['🦞','🦐','🦑','🦀','🦪','🐟','🐠','🐡','🎣','🍣','🍤','🍙','🍚','🍘','🍥'],
    'dulces': ['🍰','🎂','🧁','🍮','🍭','🍬','🍫','🍩','🍪','🥧','🍡','🍧','🍨','🍦','🥮'],
    'bebidas': ['☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷','🍸','🍹','🍾','🥃','🍶'],
    'frutas': ['🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍑','🍒','🥭','🍍','🥥','🥝','🍅','🫒','🥑'],
    'otros': ['🌮','🥨','🥐','🍞','🥖','🫓','🧂','🫕','🥣','🥗','🫔','🌶️','🫑','🥦','🧄','🧅','🥔','🌽'],
  };

  const panel = $('ficha-edit-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="edit-panel-inner" id="edit-panel-inner" style="display:none">

      <!-- EMOJI PICKER -->
      <div class="edit-panel-field">
        <label class="edit-panel-label">Emoji</label>
        <div class="ep-emoji-row">
          <div id="ep-emoji-current" class="ep-emoji-current">${Storage.getEmoji(r.id) || r.emoji || '🍽️'}</div>
          <input id="ep-emoji-search" class="edit-panel-input" placeholder="Buscar: pizza, café, sushi..." style="flex:1">
        </div>
        <div id="ep-emoji-grid" class="ep-emoji-grid">
          ${EMOJI_CATS['comida'].map(e => `<span class="ep-emoji-opt" data-emoji="${e}">${e}</span>`).join('')}
        </div>
      </div>

      <!-- BARRIO -->
      <div class="edit-panel-field">
        <label class="edit-panel-label">Barrio</label>
        <div id="ep-barrio-opts" class="ep-select-opts">
          ${barrios.map(b => `<div class="ep-select-opt${b===barrio?' selected':''}" data-val="${b}">${b}</div>`).join('')}
          <div class="ep-select-opt ep-select-add" data-val="__nuevo__">+ Añadir barrio</div>
        </div>
        <div id="ep-barrio-new-wrap" style="display:none;margin-top:8px">
          <div style="display:flex;gap:8px;align-items:center">
            <input id="ep-barrio-input" class="edit-panel-input" placeholder="Nuevo barrio..." style="flex:1">
            <button id="ep-barrio-confirm" class="ep-confirm-btn">✓</button>
          </div>
        </div>
      </div>

      <!-- COCINA (multi-select) -->
      <div class="edit-panel-field">
        <label class="edit-panel-label">Tipo de cocina <span style="color:var(--text3);font-weight:400">(selecciona una o varias)</span></label>
        <div id="ep-cocina-opts" class="ep-select-opts">
          ${cocinas.map(c => `<div class="ep-select-opt${cocinaArr2.includes(c)?' selected':''}" data-val="${c}">${c}</div>`).join('')}
          <div class="ep-select-opt ep-select-add" data-val="__nuevo__">+ Añadir cocina</div>
        </div>
        <div id="ep-cocina-new-wrap" style="display:none;margin-top:8px;display:none">
          <div style="display:flex;gap:8px;align-items:center">
            <input id="ep-cocina-input" class="edit-panel-input" placeholder="Nueva cocina..." style="flex:1">
            <button id="ep-cocina-confirm" class="ep-confirm-btn">✓</button>
          </div>
        </div>
      </div>

      <!-- PRECIO -->
      <div class="edit-panel-field">
        <label class="edit-panel-label">Precio</label>
        <div class="precio-row" id="ep-precio-row">
          ${['€','€€','€€€','€€€€'].map(p =>
            `<div class="precio-opt${precio===p?' selected':''}" data-p="${p}">${p}</div>`
          ).join('')}
        </div>
      </div>

      <!-- ETIQUETAS -->
      <div class="edit-panel-field">
        <label class="edit-panel-label">Etiquetas</label>
        <div class="ep-toggles">
          <div class="ep-toggle${picar?' active':''}" data-toggle="picar">🍢 Picar</div>
          <div class="ep-toggle${menu?' active':''}" data-toggle="menu">📋 Menú del día</div>
          ${TOGGLES.map(t =>
            `<div class="ep-toggle${tags.includes(t.key)?' active':''}" data-toggle="${t.key}">${t.label}</div>`
          ).join('')}
        </div>
      </div>

      <button class="edit-panel-save" id="ep-save-btn">Guardar cambios ✓</button>
      ${r.origen === 'usuario' ? `
        <button class="edit-panel-delete" id="ep-delete-btn">✕ Eliminar restaurante</button>
      ` : ''}
    </div>
    <button class="edit-panel-toggle" id="ep-toggle-btn">✎ Editar datos</button>
  `;

  // ── Toggle abrir/cerrar ──
  $('ep-toggle-btn').onclick = () => {
    const inner = $('edit-panel-inner');
    const isOpen = inner.style.display !== 'none';
    inner.style.display = isOpen ? 'none' : 'block';
    $('ep-toggle-btn').textContent = isOpen ? '✎ Editar datos' : '✕ Cancelar edición';
  };

  // ── Emoji picker ──
  const EMOJI_SEARCH = {
    'pizza': '🍕', 'cafe': '☕', 'café': '☕', 'sushi': '🍣', 'hamburguesa': '🍔',
    'pasta': '🍝', 'ensalada': '🥗', 'carne': '🥩', 'pollo': '🍗', 'pescado': '🐟',
    'marisco': '🦞', 'cerveza': '🍺', 'vino': '🍷', 'coctel': '🍸', 'taco': '🌮',
    'ramen': '🍜', 'curry': '🍛', 'helado': '🍦', 'tarta': '🍰', 'pan': '🥖',
    'desayuno': '🍳', 'brunch': '🧇', 'bocadillo': '🥪', 'wrap': '🌯', 'arroz': '🍚',
    'mariscos': '🦐', 'ostras': '🦪', 'pulpo': '🦑', 'gambas': '🦐', 'atun': '🐟',
    'chocolate': '🍫', 'postre': '🍮', 'copa': '🥂', 'whisky': '🥃', 'te': '🍵',
    'vegano': '🥗', 'verduras': '🥦', 'fruta': '🍎', 'japonés': '🍣', 'chino': '🥡',
    'indio': '🍛', 'mexicano': '🌮', 'italiano': '🍝', 'griego': '🥙', 'pintxos': '🍢',
    'bar': '🍺', 'tapas': '🍢', 'asador': '🥩', 'parrilla': '🥩',
  };

  let selectedEmoji = Storage.getEmoji(r.id) || r.emoji || '🍽️';

  const updateEmojiGrid = (emojis) => {
    $('ep-emoji-grid').innerHTML = emojis.map(e =>
      `<span class="ep-emoji-opt${e===selectedEmoji?' sel':''}" data-emoji="${e}">${e}</span>`
    ).join('');
    $('ep-emoji-grid').querySelectorAll('.ep-emoji-opt').forEach(el => {
      el.addEventListener('click', () => {
        selectedEmoji = el.dataset.emoji;
        $('ep-emoji-current').textContent = selectedEmoji;
        $('ep-emoji-grid').querySelectorAll('.ep-emoji-opt').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
      });
    });
  };
  updateEmojiGrid(EMOJI_CATS['comida']);

  $('ep-emoji-search').addEventListener('input', function() {
    const q = this.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    if (!q) { updateEmojiGrid(EMOJI_CATS['comida']); return; }
    // Buscar en keywords
    const matches = new Set();
    Object.entries(EMOJI_SEARCH).forEach(([k, v]) => {
      if (k.normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q)) matches.add(v);
    });
    // Buscar en todas las categorías también
    Object.values(EMOJI_CATS).flat().forEach(e => {
      if (matches.size < 30) matches.add(e); // fallback: mostrar todos si sin resultados
    });
    updateEmojiGrid(matches.size > 0 ? [...matches] : Object.values(EMOJI_CATS).flat().slice(0,30));
  });

  // ── Barrio select ──
  let selectedBarrio = barrio;
  panel.querySelectorAll('#ep-barrio-opts .ep-select-opt').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.val === '__nuevo__') {
        $('ep-barrio-new-wrap').style.display = 'block';
        $('ep-barrio-input').focus();
        return;
      }
      selectedBarrio = el.dataset.val;
      panel.querySelectorAll('#ep-barrio-opts .ep-select-opt').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      $('ep-barrio-new-wrap').style.display = 'none';
    });
  });
  $('ep-barrio-confirm').addEventListener('click', () => {
    const val = $('ep-barrio-input').value.trim();
    if (!val) return;
    selectedBarrio = val;
    // Añadir como opción seleccionada visualmente
    panel.querySelectorAll('#ep-barrio-opts .ep-select-opt').forEach(x => x.classList.remove('selected'));
    const newOpt = document.createElement('div');
    newOpt.className = 'ep-select-opt selected';
    newOpt.dataset.val = val;
    newOpt.textContent = val;
    const addBtn = panel.querySelector('#ep-barrio-opts .ep-select-add');
    $('ep-barrio-opts').insertBefore(newOpt, addBtn);
    $('ep-barrio-new-wrap').style.display = 'none';
    $('ep-barrio-input').value = '';
  });

  // ── Cocina multi-select ──
  let selectedCocinas = [...cocinaArr2];
  panel.querySelectorAll('#ep-cocina-opts .ep-select-opt').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.val === '__nuevo__') {
        $('ep-cocina-new-wrap').style.display = 'block';
        $('ep-cocina-input').focus();
        return;
      }
      // Toggle multi-select
      el.classList.toggle('selected');
      const val = el.dataset.val;
      if (el.classList.contains('selected')) {
        if (!selectedCocinas.includes(val)) selectedCocinas.push(val);
      } else {
        selectedCocinas = selectedCocinas.filter(c => c !== val);
      }
    });
  });
  $('ep-cocina-confirm').addEventListener('click', () => {
    const val = $('ep-cocina-input').value.trim();
    if (!val) return;
    if (!selectedCocinas.includes(val)) selectedCocinas.push(val);
    // Añadir como opción seleccionada visualmente
    const newOpt = document.createElement('div');
    newOpt.className = 'ep-select-opt selected';
    newOpt.dataset.val = val;
    newOpt.textContent = val;
    const addBtn = panel.querySelector('#ep-cocina-opts .ep-select-add');
    $('ep-cocina-opts').insertBefore(newOpt, addBtn);
    newOpt.addEventListener('click', () => {
      newOpt.classList.toggle('selected');
      if (newOpt.classList.contains('selected')) {
        if (!selectedCocinas.includes(val)) selectedCocinas.push(val);
      } else {
        selectedCocinas = selectedCocinas.filter(c => c !== val);
      }
    });
    $('ep-cocina-new-wrap').style.display = 'none';
    $('ep-cocina-input').value = '';
  });

  // ── Precio opts ──
  panel.querySelectorAll('#ep-precio-row .precio-opt').forEach(o => {
    o.addEventListener('click', () => {
      panel.querySelectorAll('#ep-precio-row .precio-opt').forEach(x => x.classList.remove('selected'));
      o.classList.add('selected');
    });
  });

  // ── Toggles ──
  panel.querySelectorAll('.ep-toggle').forEach(t => {
    t.addEventListener('click', () => t.classList.toggle('active'));
  });

  // ── Guardar ──
  // Eliminar (solo restaurantes de usuario)
  const epDeleteBtn = $('ep-delete-btn');
  if (epDeleteBtn) {
    epDeleteBtn.onclick = () => {
      if (State.fichaId) deleteRestaurant(State.fichaId);
    };
  }

  $('ep-save-btn').onclick = () => {
    const newBarrio  = selectedBarrio || r.barrio;
    const newCocinas = selectedCocinas.length > 0 ? selectedCocinas : getCocinas(r);
    const newPrecio  = panel.querySelector('#ep-precio-row .precio-opt.selected')?.dataset.p;
    const newPicar   = panel.querySelector('[data-toggle="picar"]').classList.contains('active');
    const newMenu    = panel.querySelector('[data-toggle="menu"]').classList.contains('active');

    // Guardar emoji
    if (selectedEmoji) Storage.saveEmoji(r.id, selectedEmoji);

    // Tags
    let newTags = [...(r.tags||[])];
    const managedTags = ['muy local','desayuno','vistas','nocturno'];
    managedTags.forEach(k => {
      const isActive = panel.querySelector(`[data-toggle="${k}"]`).classList.contains('active');
      if (isActive && !newTags.includes(k)) newTags.push(k);
      if (!isActive) newTags = newTags.filter(t => t !== k);
    });

    Overrides.set(r.id, {
      barrio:       newBarrio,
      cocinas:      newCocinas,
      tipo_cocina:  newCocinas[0] || r.tipo_cocina,
      precio:       newPrecio  || r.precio,
      picar:        newPicar,
      menu_del_dia: newMenu,
      tags:         newTags,
    });

    const rLive = State.allRests.find(x => x.id === r.id);
    if (rLive) {
      rLive.barrio       = newBarrio;
      rLive.cocinas      = newCocinas;
      rLive.tipo_cocina  = newCocinas[0] || r.tipo_cocina;
      rLive.precio       = newPrecio  || r.precio;
      rLive.picar        = newPicar;
      rLive.menu_del_dia = newMenu;
      rLive.tags         = newTags;
    }

    $('edit-panel-inner').style.display = 'none';
    $('ep-toggle-btn').textContent = '✎ Editar datos';
    fillFicha(State.allRests.find(x => x.id === r.id) || r);
    renderLista();
    showToast('✓ Datos actualizados');
  };
}

// ── FAV / WISH ──
function toggleFav(id) {
  const now = Storage.toggleFav(id);
  showToast(now ? '♥ Añadido a favoritos' : 'Eliminado de favoritos');
  renderLista();
  if (State.currentView === 'favs') renderFavs();
  if (State.fichaId === id) {
    $('ficha-fav-btn').className  = `ficha-icon-btn${now ? ' fav-on' : ''}`;
    $('ficha-fav-btn').textContent = now ? '♥' : '♡';
  }
}
function toggleWish(id) {
  const now = Storage.toggleWish(id);
  showToast(now ? '⊕ Añadido a Quiero ir' : 'Eliminado de wishlist');
  renderLista();
  if (State.currentView === 'favs') renderFavs();
  if (State.fichaId === id)
    $('ficha-wish-btn').className = `ficha-icon-btn${now ? ' wish-on' : ''}`;
}

// ── FAVORITOS ──
function renderFavs() {
  const isFavs = State.favTab === 'favs';
  // Solo mostrar favs/wish de la ciudad activa
  const ciudadActual = getCurrent();
  const items = ciudadActual.filter(r => isFavs ? Storage.isFav(r.id) : Storage.isWish(r.id));
  const list = $('favs-list');

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${isFavs?'♡':'⊕'}</div>
      <div class="empty-title">${isFavs?'Sin favoritos aún':'Wishlist vacía'}</div>
      <div class="empty-sub">${isFavs?'Pulsa ♥ en cualquier restaurante':'Pulsa ⊕ en los que quieres visitar'}</div>
    </div>`;
    return;
  }

  list.innerHTML = `<div style="padding:0 16px">${items.map((r,i) => buildCard(r,i)).join('')}</div>` + `
    <div style="padding:12px 16px 0">
      <button id="export-wsp-btn" style="width:100%;padding:14px;border-radius:14px;
        background:var(--bg3);border:1.5px solid var(--border2);color:var(--text2);
        font-size:15px;font-weight:500;font-family:var(--font);cursor:pointer;
        display:flex;align-items:center;justify-content:center;gap:8px;">
        ↗ Exportar a WhatsApp
      </button>
    </div>`;

  $('export-wsp-btn')?.addEventListener('click', () => exportWhatsApp(items));
  bindCards(list);
}

// ── WHATSAPP ──
function shareWhatsApp(r) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent((r.nombre||'')+' '+(r.barrio||''))}`;
  const msg = `🍽️ *${r.nombre}*\n📍 ${r.barrio}\n🍴 ${r.tipo_cocina||''} · ${r.precio}\n⭐ ${r.rating}/5\n🗺️ ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}
function exportWhatsApp(lista) {
  const lines = lista.map(r => `• *${r.nombre}* (${r.barrio}) · ${r.precio} · ⭐${r.rating}`);
  window.open(`https://wa.me/?text=${encodeURIComponent('🍽️ *Mi lista*\n\n'+lines.join('\n'))}`, '_blank');
}

// ── AÑADIR RESTAURANTE ──
function openAddSheet() {
  $('add-url').value = '';
  $('add-error').style.display = 'none';
  $('add-preview').style.display = 'none';
  $('add-phase-search').style.display = 'block';
  $('add-phase-confirm').style.display = 'none';
  // Pre-rellenar buscador si hay texto
  if (State.filters.query.trim()) {
    $('add-url').value = State.filters.query.trim();
  }
  openSheet('add-sheet');
}

async function searchPlace() {
  const input = $('add-url').value.trim();
  if (!input) { showAddError('Escribe el nombre del restaurante o pega un link de Google Maps'); return; }

  $('add-search-btn').textContent = 'Buscando...';
  $('add-search-btn').disabled = true;
  $('add-error').style.display = 'none';

  try {
    const data = await Maps.searchPlace(input);
    $('add-preview').style.display = 'block';
    $('add-preview').innerHTML = `
      <div class="add-preview-name">${data.nombre}</div>
      <div class="add-preview-meta">
        ${data.direccion || ''}
        ${data.rating ? `<br>⭐ ${data.rating} · ${(data.votos||0).toLocaleString()} reseñas` : ''}
      </div>`;
    $('add-phase-search').style.display = 'none';
    $('add-phase-confirm').style.display = 'block';
    $('add-emoji').value = '🍽️';
    $('add-barrio').value = '';
    $('add-cocina').value = '';
    $('add-phase-confirm').dataset.place = JSON.stringify(data);
  } catch(e) {
    showAddError(e.message || 'No se encontró. Prueba escribiendo solo el nombre.');
  } finally {
    $('add-search-btn').textContent = 'Buscar →';
    $('add-search-btn').disabled = false;
  }
}

function showAddError(msg) {
  $('add-error').textContent = msg;
  $('add-error').style.display = 'block';
}

function saveRestaurant() {
  let data;
  try { data = JSON.parse($('add-phase-confirm').dataset.place || '{}'); } catch(e) { return; }

  const key = State.currentCiudad || Object.keys(State.ciudades)[0] || 'Brasil/Río de Janeiro/Río de Janeiro';
  const parts = key.split('/');

  const nuevo = {
    id: `user-${Date.now()}`,
    nombre: data.nombre,
    pais: parts[0], region: parts[1], municipio: parts[2],
    barrio: $('add-barrio').value.trim() || 'Sin barrio',
    tipo_cocina: $('add-cocina').value.trim() || 'Sin especificar',
    precio: document.querySelector('.precio-opt.selected')?.dataset.p || '€€',
    precio_medio_brl: 0, ambiente: [], tags: [],
    emoji: $('add-emoji').value.trim() || '🍽️',
    rating: data.rating || 0, votos: data.votos || 0,
    picar: false, menu_del_dia: false,
    coordenadas: data.coordenadas || { lat:0, lng:0 },
    horario: data.horario || {},
    descripcion: data.direccion || '',
    platos_destacados: [], tip_local: '', resena_destacada: '',
    google_place_id: data.google_place_id || '',
    web: data.web || '', telefono: data.telefono || '',
    origen: 'usuario',
  };

  const notes = $('add-notes').value.trim();
  if (notes) Storage.saveNote(nuevo.id, notes);

  State.allRests.push(nuevo);
  if (!State.ciudades[key]) State.ciudades[key] = [];
  State.ciudades[key].push(nuevo);

  try {
    const saved = JSON.parse(localStorage.getItem('gastro_user') || '[]');
    saved.push(nuevo);
    localStorage.setItem('gastro_user', JSON.stringify(saved));
  } catch(e) {}

  closeSheet();
  renderLista();
  showToast('✓ Restaurante añadido');
  // Abrir ficha del nuevo restaurante con panel editar datos abierto
  setTimeout(() => {
    openFicha(nuevo.id);
    setTimeout(() => {
      const toggleBtn = $('ep-toggle-btn');
      if (toggleBtn) {
        const inner = $('edit-panel-inner');
        if (inner) inner.style.display = 'block';
        toggleBtn.textContent = '✕ Cancelar edición';
      }
    }, 150);
  }, 100);
}

// ── EDITAR RESTAURANTE ──
function openEditSheet(id) {
  const r = State.allRests.find(x => x.id === id);
  if (!r) return;

  $('edit-nombre').value = r.nombre || '';
  $('edit-emoji').value  = Storage.getEmoji(id) || r.emoji || '🍽️';
  $('edit-barrio').value = r.barrio || '';
  $('edit-cocina').value = r.tipo_cocina || '';
  $('edit-desc').value   = r.descripcion || '';

  // Precio
  $$('#edit-precio-row .precio-opt').forEach(o => {
    o.classList.toggle('selected', o.dataset.p === r.precio);
  });

  $('edit-sheet').dataset.id = id;
  openSheet('edit-sheet');
}

function saveEdit() {
  const id = $('edit-sheet').dataset.id;
  const r  = State.allRests.find(x => x.id === id);
  if (!r) return;

  r.nombre      = $('edit-nombre').value.trim() || r.nombre;
  r.barrio      = $('edit-barrio').value.trim() || r.barrio;
  r.tipo_cocina = $('edit-cocina').value.trim() || r.tipo_cocina;
  r.descripcion = $('edit-desc').value.trim()   || r.descripcion;
  r.precio      = document.querySelector('#edit-precio-row .precio-opt.selected')?.dataset.p || r.precio;

  const newEmoji = $('edit-emoji').value.trim();
  if (newEmoji) Storage.saveEmoji(id, newEmoji);

  // Actualizar en ciudades
  const key = `${r.pais}/${r.region}/${r.municipio}`;
  if (State.ciudades[key]) {
    const idx = State.ciudades[key].findIndex(x => x.id === id);
    if (idx >= 0) State.ciudades[key][idx] = r;
  }

  // Actualizar en localStorage si es de usuario
  if (r.origen === 'usuario') {
    try {
      const saved = JSON.parse(localStorage.getItem('gastro_user') || '[]');
      const idx = saved.findIndex(x => x.id === id);
      if (idx >= 0) saved[idx] = r;
      localStorage.setItem('gastro_user', JSON.stringify(saved));
    } catch(e) {}
  }

  closeSheet();
  fillFicha(r);
  renderLista();
  showToast('✓ Restaurante actualizado');
}

// ── ELIMINAR RESTAURANTE ──
function deleteRestaurant(id) {
  const r = State.allRests.find(x => x.id === id);
  if (!r) return;

  if (!confirm(`¿Eliminar "${r.nombre}" de tu lista?`)) return;

  // Quitar de allRests
  State.allRests = State.allRests.filter(x => x.id !== id);

  // Quitar de ciudades
  const key = `${r.pais}/${r.region}/${r.municipio}`;
  if (State.ciudades[key]) {
    State.ciudades[key] = State.ciudades[key].filter(x => x.id !== id);
  }

  // Quitar de localStorage si es de usuario
  if (r.origen === 'usuario') {
    try {
      const saved = JSON.parse(localStorage.getItem('gastro_user') || '[]');
      localStorage.setItem('gastro_user', JSON.stringify(saved.filter(x => x.id !== id)));
    } catch(e) {}
  }

  closeFicha();
  renderLista();
  showToast('Restaurante eliminado');
}

// ── SHEETS ──
function openSheet(id) {
  closeSheet();
  $('sheet-overlay').classList.add('open');
  $(id).classList.add('open');
}
function closeSheet() {
  $('sheet-overlay').classList.remove('open');
  $$('.sheet').forEach(s => s.classList.remove('open'));
}

// ── FILTROS ──
function openFilterSheet(type) {
  const labels = { barrio:'Barrio', cocina:'Tipo de cocina', precio:'Precio' };
  $('filter-title').textContent = labels[type] || type;

  let opts = [];
  if (type === 'barrio') opts = Filters.getBarrios(getCurrent());
  if (type === 'cocina') opts = Filters.getCocinas(getCurrent());
  if (type === 'precio') opts = Filters.getPrecios();

  const cur = State.filters[type];
  $('filter-options').innerHTML = opts.map(o =>
    `<div class="sheet-option${cur===o?' selected':''}" data-val="${o}">${o}</div>`
  ).join('');

  $('filter-options').querySelectorAll('.sheet-option').forEach(el => {
    el.addEventListener('click', () => {
      $('filter-options').querySelectorAll('.sheet-option').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  $('filter-sheet').dataset.type = type;
  openSheet('filter-sheet');
}

function applyFilter() {
  const type = $('filter-sheet').dataset.type;
  const sel = $('filter-options').querySelector('.sheet-option.selected');
  State.filters[type] = sel ? sel.dataset.val : null;
  updatePills(); closeSheet(); renderLista();
  syncMapFilters();
}
function clearFilter() {
  State.filters[$('filter-sheet').dataset.type] = null;
  updatePills(); closeSheet(); renderLista();
  syncMapFilters();
}
function updatePills() {
  $$('.filter-pill[data-filter]').forEach(p => {
    const k = p.dataset.filter, v = State.filters[k], lbl = p.querySelector('.pill-label');
    p.classList.toggle('active', !!v);
    lbl.textContent = v || lbl.dataset.default;
  });
}

// ── SYNC MAPA CON FILTROS ──
function syncMapFilters() {
  if (State.currentView === 'mapa' && mapReady) {
    const filtered = Filters.apply(getCurrent(), State.filters, Storage);
    const sorted = sortedList(filtered);
    Maps.updateMarkersFiltered(sorted, Storage.isFav);
  }
}

// ── NAVEGACIÓN ──
function switchView(view) {
  State.currentView = view;
  $$('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  $$('.view').forEach(v => {
    const on = v.id === `view-${view}`;
    v.style.display = on ? 'flex' : 'none';
    v.classList.toggle('active', on);
  });
  if (view === 'mapa')  initMap();
  if (view === 'favs')  renderFavs();
  if (view === 'lista') renderLista();
  // Sincronizar filtros con mapa si ya estaba inicializado
  if (view === 'mapa' && mapReady) {
    const filtered = Filters.apply(getCurrent(), State.filters, Storage);
    const sorted = sortedList(filtered);
    Maps.updateMarkersFiltered(sorted, Storage.isFav);
  }
}

// ── MAPA ──
// Usamos una variable para saber si ya está inicializado
let mapReady = false;

// Centro por defecto de cada ciudad
const CITY_CENTERS = {
  'Río de Janeiro': { lat: -22.9519, lng: -43.2105 },
  'Salvador de Bahía': { lat: -13.0117, lng: -38.4782 },
  'Bilbao': { lat: 43.2603, lng: -2.9350 },
};

async function initMap() {
  if (mapReady) {
    // Ya inicializado — centrar en ciudad activa y actualizar marcadores
    const cityName = State.currentCiudad?.split('/')?.pop();
    const center = CITY_CENTERS[cityName];
    if (center) Maps.centerOn(center.lat, center.lng);
    Maps.setMarkers(getCurrent(), Storage.isFav);
    return;
  }

  requestAnimationFrame(async () => {
    const el = $('map');
    const container = $('map-container');

    const topNav    = document.querySelector('.top-nav')?.offsetHeight || 0;
    const chipsRow  = document.querySelector('.chips-row')?.offsetHeight || 0;
    const filterBar = document.querySelector('.filter-bar')?.offsetHeight || 0;
    const bottomNav = document.querySelector('.bottom-nav')?.offsetHeight || 60;
    const h = Math.max(window.innerHeight - topNav - chipsRow - filterBar - bottomNav, 200);

    container.style.height = h + 'px';
    el.style.position = 'absolute';
    el.style.inset = '0';

    const cityName = State.currentCiudad?.split('/')?.pop();
    const center   = CITY_CENTERS[cityName] || { lat: -22.9519, lng: -43.2105 };

    try {
      await Maps.init('map', r => openFicha(r.id), center);
      Maps.setMarkers(getCurrent(), Storage.isFav);
      mapReady = true;
      // Si ya tenemos la ubicación del usuario, mostrarla en el mapa
      if (State.userLat != null) Maps.showUserLocation(State.userLat, State.userLng);
    } catch(e) {
      console.error('Error iniciando mapa:', e);
      $('map-loading').innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--text3)">
          <div style="font-size:32px;margin-bottom:12px">◎</div>
          <div style="font-size:14px">Error cargando el mapa</div>
          <div style="font-size:12px;margin-top:6px">Comprueba tu conexión</div>
        </div>`;
    }
  });
}

// ── GEOLOCALIZACIÓN ──
function requestLocation() {
  if (!navigator.geolocation) {
    State.sort = 'rating';
    $('sort-btn').textContent = SORT_LABELS[State.sort];
    renderLista();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      State.userLat = pos.coords.latitude;
      State.userLng = pos.coords.longitude;
      autoSelectCiudad(State.userLat, State.userLng);
      renderLista();
      // Mostrar posición en el mapa si ya está inicializado
      if (mapReady) Maps.showUserLocation(State.userLat, State.userLng);
    },
    () => {
      State.sort = 'rating';
      $('sort-btn').textContent = SORT_LABELS[State.sort];
      renderLista();
    },
    { timeout:8000, enableHighAccuracy:false }
  );
}

// Auto-selecciona la ciudad más cercana al usuario (máx 100km).
// Si no hay coincidencia, selecciona Bilbao como fallback.
function autoSelectCiudad(lat, lng) {
  const FALLBACK = 'España/País Vasco/Bilbao';
  let bestKey = null;
  let bestDist = Infinity;

  for (const key of Object.keys(State.ciudades)) {
    const cityName = key.split('/').pop();
    const center = CITY_CENTERS[cityName];
    if (!center) continue;
    const d = dist(lat, lng, center.lat, center.lng);
    if (d < bestDist) { bestDist = d; bestKey = key; }
  }

  // Solo cambia si está a menos de 100km, si no usa Bilbao como fallback
  const selected = (bestKey && bestDist < 100) ? bestKey
    : (State.ciudades[FALLBACK] ? FALLBACK : Object.keys(State.ciudades)[0]);

  if (selected && selected !== State.currentCiudad) {
    State.currentCiudad = selected;
    State.filters.query  = '';
    State.filters.chips  = [];
    State.filters.barrio = null;
    State.filters.cocina = null;
    State.filters.precio = null;
    State.filters.favOnly = false;
    State.filters.soloAbiertos = false;
    $('city-name').textContent = selected.split('/').pop();
  }
}

// ── TOAST ──
let toastT = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── INIT ──
async function init() {
  await loadData();
  if (State.currentCiudad) $('city-name').textContent = State.currentCiudad.split('/').pop();

  requestLocation();
  renderLista();

  // Precargar Google Maps en segundo plano
  setTimeout(() => Maps.preload(), 3000);

  setTimeout(() => $('loading-screen').classList.add('hidden'), 500);

  // ── Tabs navegación ──
  $$('.nav-tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));

  // ── Búsqueda ──
  $('search-input').addEventListener('input', function() {
    State.filters.query = this.value;
    $('search-clear').classList.toggle('visible', this.value.length > 0);
    renderLista();
  });
  $('search-clear').addEventListener('click', () => {
    $('search-input').value = '';
    State.filters.query = '';
    $('search-clear').classList.remove('visible');
    $('add-suggestion').style.display = 'none';
    renderLista();
  });

  // ── Sugerencia añadir ──
  $('add-suggestion-btn').addEventListener('click', openAddSheet);

  // ── Solo favs ──
  $('fav-only-btn').addEventListener('click', () => {
    State.filters.favOnly = !State.filters.favOnly;
    $('fav-only-btn').classList.toggle('active', State.filters.favOnly);
    renderLista();
  });

  // ── Chips ──
  $$('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const k = chip.dataset.chip;
      if (k === 'abierto') {
        State.filters.soloAbiertos = !State.filters.soloAbiertos;
        chip.classList.toggle('active', State.filters.soloAbiertos);
        renderLista();
        syncMapFilters();
        return;
      }
      const idx = State.filters.chips.indexOf(k);
      if (idx >= 0) State.filters.chips.splice(idx,1); else State.filters.chips.push(k);
      chip.classList.toggle('active', idx < 0);
      renderLista();
      syncMapFilters();
    });
  });

  // ── Filter pills ──
  $$('.filter-pill[data-filter]').forEach(p => p.addEventListener('click', () => openFilterSheet(p.dataset.filter)));
  $('filter-apply-btn').addEventListener('click', applyFilter);
  $('filter-clear-btn').addEventListener('click', clearFilter);

  // ── Overlay cerrar ──
  $('sheet-overlay').addEventListener('click', e => {
    if (e.target === $('sheet-overlay')) closeSheet();
  });

  // ── Sort ──
  $('sort-btn').textContent = SORT_LABELS[State.sort];
  $('sort-btn').addEventListener('click', cyclSort);

  // ── Ciudad selector ──
  $('city-selector').addEventListener('click', () => {
    const keys = Object.keys(State.ciudades);
    if (keys.length <= 1) return;
    $('city-options').innerHTML = keys.map(k => {
      const name = k.split('/').pop(), reg = k.split('/')[1];
      return `<div class="sheet-option${State.currentCiudad===k?' selected':''}" data-key="${k}">
        <strong>${name}</strong> <span style="color:var(--text3);font-size:12px">${reg}</span>
      </div>`;
    }).join('');
    $('city-options').querySelectorAll('.sheet-option').forEach(el => {
      el.addEventListener('click', () => {
        State.currentCiudad = el.dataset.key;
        // Resetear todos los filtros al cambiar de ciudad
        State.filters.query  = '';
        State.filters.chips  = [];
        State.filters.barrio = null;
        State.filters.cocina = null;
        State.filters.precio = null;
        State.filters.favOnly = false;
        State.filters.soloAbiertos = false;
        // Limpiar UI de filtros
        $('search-input').value = '';
        $('search-clear').classList.remove('visible');
        $$('.chip').forEach(c => c.classList.remove('active'));
        updatePills();
        $('city-name').textContent = el.querySelector('strong').textContent;
        closeSheet(); renderLista();
        // Si el mapa está activo, recentrar y actualizar marcadores
        if (State.currentView === 'mapa' && mapReady) {
          const cityName = State.currentCiudad?.split('/')?.pop();
          const center = CITY_CENTERS[cityName];
          if (center) Maps.centerOn(center.lat, center.lng);
          Maps.setMarkers(getCurrent(), Storage.isFav);
        }
      });
    });
    openSheet('city-sheet');
  });

  // ── Añadir restaurante ──
  $('add-cancel-btn').addEventListener('click', closeSheet);
  $('add-search-btn').addEventListener('click', searchPlace);
  $('add-back-btn').addEventListener('click', () => {
    $('add-phase-search').style.display = 'block';
    $('add-phase-confirm').style.display = 'none';
    $('add-preview').style.display = 'none';
  });
  $('add-save-btn').addEventListener('click', saveRestaurant);
  $$('.precio-opt').forEach(o => o.addEventListener('click', () => {
    $$('.precio-opt').forEach(x => x.classList.remove('selected'));
    o.classList.add('selected');
  }));

  // ── Ficha ──
  $('ficha-back').addEventListener('click', closeFicha);
  $('ficha-close-btn').addEventListener('click', closeFicha);
  // ficha-edit-btn y ficha-delete-btn eliminados — gestión unificada en panel Editar datos
  $('edit-cancel-btn').addEventListener('click', closeSheet);
  $('edit-save-btn').addEventListener('click', saveEdit);
  $$('#edit-precio-row .precio-opt').forEach(o => o.addEventListener('click', () => {
    $$('#edit-precio-row .precio-opt').forEach(x => x.classList.remove('selected'));
    o.classList.add('selected');
  }));
  $('ficha-fav-btn').addEventListener('click', () => { if (State.fichaId) toggleFav(State.fichaId); });
  $('ficha-wish-btn').addEventListener('click', () => { if (State.fichaId) toggleWish(State.fichaId); });

  $('check-visited').addEventListener('click', () => {
    if (!State.fichaId) return;
    const now = Storage.toggleVisited(State.fichaId);
    $('check-visited').classList.toggle('active', now);
    showToast(now ? '✓ Marcado como visitado' : 'Desmarcado');
    renderLista();
  });
  $('check-picar').addEventListener('click', () => { $('check-picar').classList.toggle('active'); showToast('Actualizado'); });
  $('check-menu').addEventListener('click',  () => { $('check-menu').classList.toggle('active');  showToast('Actualizado'); });

  $('ficha-emoji').addEventListener('click', () => {
    if (!State.fichaId) return;
    const n = prompt('Cambia el emoji:', Storage.getEmoji(State.fichaId) || '');
    if (n !== null && n.trim()) {
      Storage.saveEmoji(State.fichaId, n.trim());
      $('ficha-emoji').textContent = n.trim();
      renderLista();
    }
  });

  const saveNote = () => {
    if (!State.fichaId) return;
    Storage.saveNote(State.fichaId, $('ficha-notes').value);
    $('notes-save-btn').classList.remove('visible');
    showToast('Nota guardada');
  };
  $('ficha-notes').addEventListener('input', () => $('notes-save-btn').classList.add('visible'));
  $('ficha-notes').addEventListener('blur', saveNote);
  $('notes-save-btn').addEventListener('click', saveNote);

  // ── Favs tabs ──
  $$('.favs-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      State.favTab = tab.dataset.tab;
      $$('.favs-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === State.favTab));
      renderFavs();
    });
  });

  // ── Swipe back en ficha ──
  let tx = 0;
  $('ficha-view').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive:true });
  $('ficha-view').addEventListener('touchend', e => {
    if (e.changedTouches[0].clientX - tx > 80 && tx < 60) closeFicha();
  }, { passive:true });

  // ── Service Worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
