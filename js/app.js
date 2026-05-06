/**
 * Mi Gastro — app.js v5b
 */

window.MAPS_API_KEY = 'TU_API_KEY_AQUI';

const State = {
  allRests: [], ciudades: {}, currentCiudad: null,
  filters: { query:'', chips:[], barrio:null, cocina:null, precio:null, favOnly:false },
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
        <span class="badge price">${r.precio}</span>
        <span class="badge ${st.open?'open':'closed'}">${st.label}</span>
        
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
  $('ficha-view').classList.add('open');
  // Resetear scroll al top al abrir la ficha
  $('ficha-scroll').scrollTop = 0;
}
function closeFicha() {
  const prevId = State.fichaId;
  $('ficha-view').classList.remove('open');
  State.fichaId = null;
  // Si venimos del mapa, resaltar el marcador del restaurante que veíamos
  if (State.currentView === 'mapa' && prevId && mapReady) {
    setTimeout(() => Maps.highlightMarker(prevId), 150);
  }
}

function fillFicha(r) {
  const st  = Filters.getOpenStatus(r);
  const fav = Storage.isFav(r.id), wish = Storage.isWish(r.id), vis = Storage.isVisited(r.id);
  const DAYS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const today = new Date().getDay();

  $('ficha-emoji').textContent = Storage.getEmoji(r.id) || r.emoji || '🍽️';
  $('ficha-fav-btn').className  = `ficha-icon-btn${fav  ? ' fav-on'  : ''}`;
  $('ficha-fav-btn').textContent = fav ? '♥' : '♡';
  $('ficha-wish-btn').className  = `ficha-icon-btn${wish ? ' wish-on' : ''}`;

  $('ficha-name').textContent = r.nombre;
  $('ficha-badges').innerHTML = `
    <span class="badge">${r.barrio}</span>
    <span class="badge">${r.tipo_cocina||''}</span>
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

  // Mostrar acciones de editar/eliminar solo para restaurantes de usuario
  const isUser = r.origen === 'usuario';
  $('ficha-user-actions').style.display = isUser ? 'block' : 'none';
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
  const items = State.allRests.filter(r => isFavs ? Storage.isFav(r.id) : Storage.isWish(r.id));
  const list = $('favs-list');

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${isFavs?'♡':'⊕'}</div>
      <div class="empty-title">${isFavs?'Sin favoritos aún':'Wishlist vacía'}</div>
      <div class="empty-sub">${isFavs?'Pulsa ♥ en cualquier restaurante':'Pulsa ⊕ en los que quieres visitar'}</div>
    </div>`;
    return;
  }

  const grupos = {};
  items.forEach(r => { if(!grupos[r.municipio]) grupos[r.municipio]=[]; grupos[r.municipio].push(r); });

  list.innerHTML = Object.entries(grupos).map(([ciudad, rests]) => `
    <div style="padding:0 16px">
      <div style="font-size:11px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;
        letter-spacing:.08em;padding:16px 0 8px;border-bottom:1px solid var(--border);margin-bottom:12px">
        ${ciudad}
      </div>
      ${rests.map((r,i) => buildCard(r,i)).join('')}
    </div>
  `).join('') + `
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
      renderLista();
    },
    () => {
      State.sort = 'rating';
      $('sort-btn').textContent = SORT_LABELS[State.sort];
      renderLista();
    },
    { timeout:8000, enableHighAccuracy:false }
  );
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
      const k = chip.dataset.chip, idx = State.filters.chips.indexOf(k);
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
  $('ficha-edit-btn').addEventListener('click', () => { if (State.fichaId) openEditSheet(State.fichaId); });
  $('ficha-delete-btn').addEventListener('click', () => { if (State.fichaId) deleteRestaurant(State.fichaId); });
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
