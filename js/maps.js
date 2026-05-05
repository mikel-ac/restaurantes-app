/**
 * maps.js v5
 * Carga Google Maps dinámicamente solo cuando se necesita.
 */
const Maps = (() => {

  let map = null;
  let markers = [];
  let infoWindow = null;
  let onSelect = null;
  let scriptLoaded = false;
  let initPromise = null;

  function loadScript(apiKey) {
    if (scriptLoaded && window.google) return Promise.resolve();
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        scriptLoaded = true;
        resolve();
        return;
      }
      window._mapsCallback = () => {
        scriptLoaded = true;
        resolve();
      };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=_mapsCallback&libraries=places`;
      s.async = true;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return initPromise;
  }

  async function init(containerId, selectCallback) {
    onSelect = selectCallback;
    await loadScript(window.MAPS_API_KEY);

    const el = document.getElementById(containerId);
    if (!el) return;

    const RIO = { lat: -22.9519, lng: -43.2105 };
    map = new google.maps.Map(el, {
      center: RIO,
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true,
      styles: DARK_STYLE,
    });
    infoWindow = new google.maps.InfoWindow();

    const loading = document.getElementById('map-loading');
    if (loading) loading.classList.add('hidden');
  }

  function setMarkers(restaurantes, isFavFn) {
    if (!map) return;
    markers.forEach(m => m.setMap(null));
    markers = [];

    restaurantes.forEach(r => {
      if (!r.coordenadas || !r.coordenadas.lat) return;
      const isUser = r.origen === 'usuario';
      const isFav = isFavFn?.(r.id);

      const marker = new google.maps.Marker({
        position: { lat: r.coordenadas.lat, lng: r.coordenadas.lng },
        map,
        title: r.nombre,
        icon: markerIcon(isFav, isUser),
      });

      marker.addListener('click', () => {
        infoWindow.setContent(infoContent(r));
        infoWindow.open(map, marker);
        google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
          const btn = document.getElementById(`iw-btn-${r.id}`);
          btn?.addEventListener('click', () => {
            infoWindow.close();
            onSelect?.(r);
          });
        });
      });

      markers.push(marker);
    });
  }

  function markerIcon(isFav, isUser) {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: isFav ? '#E24B4A' : isUser ? '#9b96e0' : '#1D9E75',
      fillOpacity: 1,
      strokeColor: '#141414',
      strokeWeight: 2.5,
      scale: 10,
    };
  }

  function infoContent(r) {
    return `<div style="font-family:'Inter',sans-serif;background:#1e1e1e;color:#f0f0f0;
      border-radius:12px;padding:13px 15px;min-width:200px;max-width:260px;">
      <div style="font-size:22px;margin-bottom:6px">${r.emoji || '🍽️'}</div>
      <div style="font-size:14px;font-weight:700">${r.nombre}</div>
      <div style="font-size:12px;color:#777;margin-top:2px">${r.barrio} · ${r.precio}</div>
      <div style="font-size:12px;color:#EF9F27;margin-top:5px">★ ${r.rating}
        <span style="color:#555"> · ${(r.votos||0).toLocaleString()} reseñas</span></div>
      <button id="iw-btn-${r.id}" style="margin-top:10px;width:100%;background:#1D9E75;
        color:#fff;border:none;border-radius:8px;padding:8px;font-size:12px;font-weight:600;
        font-family:'Inter',sans-serif;cursor:pointer;">Ver ficha →</button>
    </div>`;
  }

  async function searchPlace(input) {
    await loadScript(window.MAPS_API_KEY);

    const svc = new google.maps.places.PlacesService(
      map || (() => { const d = document.createElement('div'); document.body.appendChild(d); return d; })()
    );

    let searchQuery = input.trim();

    // Si es un URL largo de Maps, intentar extraer el nombre del lugar
    if (searchQuery.startsWith('http')) {
      const nameMatch = searchQuery.match(/\/place\/([^/@?+]+)/);
      if (nameMatch) {
        searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      } else {
        const qMatch = searchQuery.match(/[?&]q=([^&]+)/);
        if (qMatch) searchQuery = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
      }
    }

    return new Promise((resolve, reject) => {
      svc.findPlaceFromQuery(
        { query: searchQuery, fields: ['place_id', 'name', 'geometry'] },
        (results, status) => {
          if (status !== 'OK' || !results?.length) {
            reject(new Error('No se encontró el restaurante. Prueba escribiendo solo el nombre.'));
            return;
          }
          getDetails(svc, results[0].place_id).then(resolve).catch(reject);
        }
      );
    });
  }

  function getDetails(svc, placeId) {
    return new Promise((resolve, reject) => {
      svc.getDetails(
        {
          placeId,
          fields: [
            'name', 'formatted_address', 'rating', 'user_ratings_total',
            'opening_hours', 'geometry', 'international_phone_number',
            'website', 'url'
          ]
        },
        (place, status) => {
          if (status !== 'OK' || !place) {
            reject(new Error('No se pudieron obtener los detalles'));
            return;
          }
          resolve({
            nombre: place.name,
            direccion: place.formatted_address,
            rating: place.rating || 0,
            votos: place.user_ratings_total || 0,
            telefono: place.international_phone_number || '',
            web: place.website || '',
            coordenadas: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            },
            horario: parseHorario(place.opening_hours?.periods),
            google_place_id: placeId,
          });
        }
      );
    });
  }

  function parseHorario(periods) {
    if (!periods) return {};
    const DAYS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const result = {};
    periods.forEach(p => {
      if (!p.open) return;
      const day = DAYS[p.open.day];
      const oh = String(p.open.hours).padStart(2, '0');
      const om = String(p.open.minutes).padStart(2, '0');
      const ch = String(p.close?.hours ?? 23).padStart(2, '0');
      const cm = String(p.close?.minutes ?? 59).padStart(2, '0');
      result[day] = { abre: `${oh}:${om}`, cierra: `${ch}:${cm}` };
    });
    return result;
  }

  function centerOnUser(lat, lng) {
    if (!map) return;
    map.setCenter({ lat, lng });
    map.setZoom(15);
  }

  async function preload() {
    try { await loadScript(window.MAPS_API_KEY); } catch(e) {}
  }

  const DARK_STYLE = [
    { elementType:'geometry', stylers:[{ color:'#1a1a1a' }] },
    { elementType:'labels.text.stroke', stylers:[{ color:'#141414' }] },
    { elementType:'labels.text.fill', stylers:[{ color:'#666' }] },
    { featureType:'road', elementType:'geometry', stylers:[{ color:'#2a2a2a' }] },
    { featureType:'road', elementType:'labels.text.fill', stylers:[{ color:'#555' }] },
    { featureType:'water', elementType:'geometry', stylers:[{ color:'#0d1f2d' }] },
    { featureType:'poi', stylers:[{ visibility:'off' }] },
    { featureType:'transit', stylers:[{ visibility:'off' }] },
    { featureType:'administrative', elementType:'labels.text.fill', stylers:[{ color:'#444' }] },
  ];

  return { init, setMarkers, centerOnUser, searchPlace, preload };
})();
