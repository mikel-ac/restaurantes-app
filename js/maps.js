/**
 * maps.js — Maps se carga desde index.html
 */
const Maps = (() => {

  let map = null;
  let markers = [];
  let userMarker = null;
  let userAccuracyCircle = null;
  let onSelect = null;

  let loadPromise = null;

  function whenReady() {
    if (window.__mapsApiReady && window.google && window.google.maps) {
      return Promise.resolve();
    }
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
      window.__mapsApiCallback = resolve;
      const key = window.MAPS_API_KEY || '';
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=initMapsApi&loading=async`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Error cargando Google Maps'));
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  async function init(containerId, selectCallback, center) {
    onSelect = selectCallback;
    await whenReady();

    const el = document.getElementById(containerId);
    if (!el) return;

    const defaultCenter = center || { lat: -22.9519, lng: -43.2105 };
    map = new google.maps.Map(el, {
      center: defaultCenter,
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_BOTTOM,
      },
      styles: DARK_STYLE,
    });

    // Eliminar el borde blanco del InfoWindow con CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .gm-style .gm-style-iw-c {
        padding: 0 !important;
        border-radius: 14px !important;
        background: transparent !important;
        box-shadow: 0 4px 24px rgba(0,0,0,0.5) !important;
      }
      .gm-style .gm-style-iw-d {
        overflow: hidden !important;
        padding: 0 !important;
      }
      .gm-style .gm-style-iw-tc::after {
        background: #1e1e1e !important;
      }
      .gm-style-iw-chr {
        position: absolute !important;
        top: 6px !important;
        right: 6px !important;
        height: auto !important;
      }
      .gm-style-iw-chr button {
        width: 24px !important;
        height: 24px !important;
        opacity: 0.6 !important;
      }
      .gm-style-iw-chr button span {
        width: 14px !important;
        height: 14px !important;
        margin: 5px !important;
      }
    `;
    document.head.appendChild(styleEl);

    // Panel preview custom (en lugar de InfoWindow)
    const closeBtn = document.getElementById('map-preview-close');
    closeBtn?.addEventListener('click', closePreview);

    // Cerrar al clicar en el mapa fuera
    map.addListener('click', closePreview);

    const loading = document.getElementById('map-loading');
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => loading.style.display = 'none', 300);
    }
  }

  function setMarkers(restaurantes, isFavFn) {
    if (!map) return;
    markers.forEach(m => m.setMap(null));
    markers = [];

    restaurantes.forEach(r => {
      if (!r.coordenadas?.lat || !r.coordenadas?.lng) return;

      const marker = new google.maps.Marker({
        position: { lat: r.coordenadas.lat, lng: r.coordenadas.lng },
        map,
        title: r.nombre,
        icon: markerIcon(isFavFn?.(r.id)),
      });

      marker.addListener('click', () => {
        showPreview(r, onSelect);
      });

      marker._restId = r.id;
      markers.push(marker);
    });
  }

  // Genera un SVG de marcador moderno tipo pin con círculo
  function markerSVG(color, borderColor, scale) {
    const s = scale || 1;
    const size = Math.round(22 * s);
    const r = Math.round(10 * s);
    const stroke = Math.round(2.5 * s);
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${size + stroke*2}" height="${size + stroke*2}" viewBox="0 0 ${size + stroke*2} ${size + stroke*2}">
          <circle cx="${size/2 + stroke}" cy="${size/2 + stroke}" r="${r}"
            fill="${color}" stroke="${borderColor}" stroke-width="${stroke}"/>
        </svg>`),
      anchor: new google.maps.Point((size + stroke*2) / 2, (size + stroke*2) / 2),
      scaledSize: new google.maps.Size(size + stroke*2, size + stroke*2),
    };
  }

  function markerIcon(isFav) {
    if (isFav) return markerSVG('#E24B4A', '#141414', 1);
    return markerSVG('#1D9E75', '#141414', 1);
  }

  function infoContent(r) {
    // Estado abierto/cerrado
    const DAYS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const today = DAYS[new Date().getDay()];
    const sched = r.horario?.[today];
    let statusHtml = '';
    if (sched) {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      const [oh, om] = sched.abre.split(':').map(Number);
      const [ch, cm] = sched.cierra.split(':').map(Number);
      const open = oh * 60 + om;
      let close = ch * 60 + cm;
      if (close < open) close += 24 * 60;
      const isOpen = mins >= open && mins < close;
      statusHtml = isOpen
        ? `<span style="color:#4ECFA0;font-weight:600">Abierto</span> · cierra ${sched.cierra}h`
        : `<span style="color:#e87070;font-weight:600">Cerrado</span> · abre ${sched.abre}h`;
    }

    // Tags (máx 2)
    const tags = (r.tags || []).slice(0, 2).map(t =>
      `<span style="font-size:11px;padding:2px 8px;border-radius:6px;
        background:rgba(29,158,117,0.15);color:#4ECFA0;
        border:1px solid rgba(29,158,117,0.25)">${t}</span>`
    ).join('');

    // Platos destacados (máx 2)
    const platos = (r.platos_destacados || []).slice(0, 2).join(', ');

    return `<div style="
      font-family:'Inter',sans-serif;
      background:#1e1e1e;
      color:#f0f0f0;
      border-radius:14px;
      padding:14px 16px;
      min-width:220px;
      max-width:270px;
    ">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
        <div style="font-size:32px;line-height:1;flex-shrink:0">${r.emoji||'🍽️'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;line-height:1.3;margin-bottom:2px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.nombre}</div>
          <div style="font-size:12px;color:#777">${r.barrio} · ${r.tipo_cocina||''} · ${r.precio}</div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:#EF9F27">★ ${r.rating}</span>
        <span style="font-size:12px;color:#555">${(r.votos||0).toLocaleString()} reseñas</span>
        ${statusHtml ? `<span style="font-size:12px;color:#888">· ${statusHtml}</span>` : ''}
      </div>

      ${tags ? `<div style="display:flex;gap:5px;margin-bottom:8px;flex-wrap:wrap">${tags}</div>` : ''}

      ${platos ? `<div style="font-size:12px;color:#666;margin-bottom:10px;
        font-style:italic">🍴 ${platos}</div>` : ''}

      <button id="iw-${r.id}" style="
        width:100%;
        background:#1D9E75;
        color:#fff;
        border:none;
        border-radius:8px;
        padding:10px;
        font-size:13px;
        font-weight:600;
        font-family:'Inter',sans-serif;
        cursor:pointer;
      ">Ver ficha completa →</button>
    </div>`;
  }

  async function searchPlace(input) {
    await whenReady();

    const svc = new google.maps.places.PlacesService(
      map || document.createElement('div')
    );

    let query = input.trim();
    if (query.startsWith('http')) {
      const m = query.match(/\/place\/([^/@?+]+)/);
      if (m) query = decodeURIComponent(m[1].replace(/\+/g, ' '));
      else {
        const q = query.match(/[?&]q=([^&]+)/);
        if (q) query = decodeURIComponent(q[1].replace(/\+/g, ' '));
      }
    }

    return new Promise((resolve, reject) => {
      svc.findPlaceFromQuery(
        { query, fields: ['place_id', 'name', 'geometry'] },
        (results, status) => {
          if (status !== 'OK' || !results?.length) {
            reject(new Error('No se encontró. Prueba con el nombre exacto.'));
            return;
          }
          svc.getDetails(
            {
              placeId: results[0].place_id,
              fields: ['name','formatted_address','rating','user_ratings_total',
                       'opening_hours','geometry','international_phone_number','website'],
            },
            (place, st) => {
              if (st !== 'OK' || !place) {
                reject(new Error('No se pudieron obtener los detalles'));
                return;
              }
              const periods = place.opening_hours?.periods || [];
              const DAYS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
              const horario = {};
              periods.forEach(p => {
                if (!p.open) return;
                const d = DAYS[p.open.day];
                horario[d] = {
                  abre:   `${String(p.open.hours).padStart(2,'0')}:${String(p.open.minutes).padStart(2,'0')}`,
                  cierra: `${String(p.close?.hours??23).padStart(2,'0')}:${String(p.close?.minutes??59).padStart(2,'0')}`,
                };
              });
              resolve({
                nombre:          place.name,
                direccion:       place.formatted_address,
                rating:          place.rating || 0,
                votos:           place.user_ratings_total || 0,
                telefono:        place.international_phone_number || '',
                web:             place.website || '',
                coordenadas:     { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() },
                horario,
                google_place_id: results[0].place_id,
              });
            }
          );
        }
      );
    });
  }

  // ── PANEL PREVIEW CUSTOM ──
  function showPreview(r, selectCb) {
    const panel = document.getElementById('map-preview');
    const contentEl = document.getElementById('map-preview-content');
    if (!panel || !contentEl) return;

    const DAYS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const today = DAYS[new Date().getDay()];
    const sched = r.horario?.[today];
    let statusHtml = '';
    if (sched) {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      const [oh, om] = sched.abre.split(':').map(Number);
      const [ch, cm] = sched.cierra.split(':').map(Number);
      const open = oh * 60 + om;
      let close = ch * 60 + cm;
      if (close < open) close += 24 * 60;
      const isOpen = mins >= open && mins < close;
      statusHtml = isOpen
        ? `<span style="color:#4ECFA0;font-weight:600">Abierto</span> · cierra ${sched.cierra}h`
        : `<span style="color:#e87070;font-weight:600">Cerrado</span> · abre ${sched.abre}h`;
    }

    const tags = (r.tags || []).slice(0, 3).map(t =>
      `<span style="font-size:11px;padding:2px 8px;border-radius:6px;
        background:rgba(29,158,117,0.15);color:#4ECFA0;
        border:1px solid rgba(29,158,117,0.25);white-space:nowrap">${t}</span>`
    ).join('');

    const platos = (r.platos_destacados || []).slice(0, 2).join(', ');

    contentEl.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px">
        <div style="font-size:36px;line-height:1;flex-shrink:0">${r.emoji||'🍽️'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:700;color:#f0f0f0;line-height:1.2;margin-bottom:3px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.nombre}</div>
          <div style="font-size:12px;color:#777">${r.barrio} · ${r.tipo_cocina||''} · ${r.precio}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <span style="font-size:13px;color:#EF9F27;font-weight:600">★ ${r.rating}</span>
        <span style="font-size:12px;color:#555">${(r.votos||0).toLocaleString()} reseñas</span>
        ${statusHtml ? `<span style="font-size:12px;color:#888">· ${statusHtml}</span>` : ''}
      </div>
      ${tags ? `<div style="display:flex;gap:5px;margin-bottom:8px;flex-wrap:wrap">${tags}</div>` : ''}
      ${platos ? `<div style="font-size:12px;color:#666;margin-bottom:10px;font-style:italic">🍴 ${platos}</div>` : ''}
      <button id="map-preview-open" style="
        width:100%;background:#1D9E75;color:#fff;border:none;border-radius:8px;
        padding:11px;font-size:14px;font-weight:600;
        font-family:'Inter',sans-serif;cursor:pointer;">
        Ver ficha completa →
      </button>`;

    panel.style.display = 'block';

    document.getElementById('map-preview-open')?.addEventListener('click', () => {
      closePreview();
      selectCb?.(r);
    });
  }

  function closePreview() {
    const panel = document.getElementById('map-preview');
    if (panel) panel.style.display = 'none';
  }

  // Resaltar marcador al volver de la ficha
  function highlightMarker(restauranteId) {
    markers.forEach(m => {
      if (m._restId === restauranteId) {
        const original = m.getIcon();
        m.setIcon(markerSVG('#EF9F27', '#141414', 1.5));
        map.panTo(m.getPosition());
        setTimeout(() => m.setIcon(original), 1500);
      }
    });
  }

  // Actualizar marcadores con filtro (para sincronizar con chips/filtros)
  function updateMarkersFiltered(restaurantes, isFavFn) {
    setMarkers(restaurantes, isFavFn);
  }

  function centerOnUser(lat, lng) {
    if (!map) return;
    map.setCenter({ lat, lng });
    map.setZoom(15);
  }

  function centerOn(lat, lng, zoom) {
    if (!map) return;
    map.setCenter({ lat, lng });
    map.setZoom(zoom || 13);
  }

  function preload() {}

  // Estilo oscuro más legible — texto claro, agua azul visible, calles diferenciadas
  const DARK_STYLE = [
    { elementType: 'geometry',            stylers: [{ color: '#212121' }] },
    { elementType: 'labels.text.stroke',  stylers: [{ color: '#1a1a1a' }] },
    { elementType: 'labels.text.fill',    stylers: [{ color: '#cccccc' }] },

    { featureType: 'road',
      elementType: 'geometry',            stylers: [{ color: '#3a3a3a' }] },
    { featureType: 'road',
      elementType: 'labels.text.fill',    stylers: [{ color: '#bbbbbb' }] },
    { featureType: 'road.arterial',
      elementType: 'geometry',            stylers: [{ color: '#505050' }] },
    { featureType: 'road.highway',
      elementType: 'geometry',            stylers: [{ color: '#484848' }] },
    { featureType: 'road.highway',
      elementType: 'labels.text.fill',    stylers: [{ color: '#ffffff' }] },

    { featureType: 'water',
      elementType: 'geometry',            stylers: [{ color: '#17374a' }] },
    { featureType: 'water',
      elementType: 'labels.text.fill',    stylers: [{ color: '#5aadcc' }] },

    { featureType: 'landscape',
      elementType: 'geometry',            stylers: [{ color: '#2a2a2a' }] },
    { featureType: 'landscape.natural',
      elementType: 'geometry',            stylers: [{ color: '#1e2e1e' }] },

    { featureType: 'poi',
      elementType: 'geometry',            stylers: [{ color: '#2a2a2a' }] },
    { featureType: 'poi',
      elementType: 'labels',              stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park',
      elementType: 'geometry',            stylers: [{ color: '#1a2e1a' }] },

    { featureType: 'transit',             stylers: [{ visibility: 'off' }] },

    { featureType: 'administrative',
      elementType: 'labels.text.stroke',  stylers: [{ color: '#1a1a1a' }] },
    { featureType: 'administrative',
      elementType: 'labels.text.fill',    stylers: [{ color: '#ffffff' }] },
    { featureType: 'administrative.locality',
      elementType: 'labels.text.fill',    stylers: [{ color: '#ffffff' }] },
    { featureType: 'administrative.neighborhood',
      elementType: 'labels.text.fill',    stylers: [{ color: '#e0e0e0' }] },
    { featureType: 'administrative.land_parcel',
      elementType: 'labels',              stylers: [{ visibility: 'off' }] },
  ];

  // Muestra la posición del usuario en el mapa con punto azul pulsante
  function showUserLocation(lat, lng) {
    if (!map) return;

    // Círculo de precisión sutil
    if (userAccuracyCircle) userAccuracyCircle.setMap(null);
    userAccuracyCircle = new google.maps.Circle({
      map,
      center: { lat, lng },
      radius: 80,
      fillColor: '#4A90E2',
      fillOpacity: 0.12,
      strokeColor: '#4A90E2',
      strokeOpacity: 0.25,
      strokeWeight: 1,
    });

    // Punto azul pulsante con SVG animado
    const svgPulse = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="12" fill="#4A90E2" fill-opacity="0.18">
        <animate attributeName="r" values="8;13;8" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="fill-opacity" values="0.18;0.05;0.18" dur="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="14" cy="14" r="7" fill="#4A90E2" stroke="#ffffff" stroke-width="2.5"/>
    </svg>`;

    const icon = {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgPulse),
      anchor: new google.maps.Point(14, 14),
      scaledSize: new google.maps.Size(28, 28),
    };

    if (userMarker) {
      userMarker.setPosition({ lat, lng });
      userMarker.setIcon(icon);
    } else {
      userMarker = new google.maps.Marker({
        position: { lat, lng },
        map,
        icon,
        title: 'Tu posición',
        zIndex: 999,
      });
    }
  }

  return { init, setMarkers, updateMarkersFiltered, highlightMarker, centerOnUser, centerOn, searchPlace, preload, showUserLocation };
})();
