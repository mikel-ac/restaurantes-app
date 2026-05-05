/**
 * maps.js — carga robusta de Google Maps
 */
const Maps = (() => {

  let map = null;
  let markers = [];
  let infoWindow = null;
  let onSelect = null;
  let loaded = false;
  let loadPromise = null;

  // ── CARGAR SCRIPT ──
  // Garantiza que el callback global existe ANTES de inyectar el script
  function loadScript() {
    if (loaded && window.google && window.google.maps) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
      // Si ya está cargado por algún motivo
      if (window.google && window.google.maps) {
        loaded = true;
        resolve();
        return;
      }

      // Definir callback ANTES de crear el script
      window.__mapsReady = () => {
        loaded = true;
        resolve();
      };

      const key = window.MAPS_API_KEY || '';
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=__mapsReady&loading=async`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        loadPromise = null;
        reject(new Error('No se pudo cargar Google Maps'));
      };
      document.head.appendChild(script);
    });

    return loadPromise;
  }

  // ── INICIALIZAR MAPA ──
  async function init(containerId, selectCallback) {
    onSelect = selectCallback;

    await loadScript();

    const el = document.getElementById(containerId);
    if (!el) throw new Error('Contenedor del mapa no encontrado');

    // Calcular altura disponible real
    const navTop    = document.querySelector('.top-nav')?.offsetHeight || 0;
    const chips     = document.querySelector('.chips-row')?.offsetHeight || 0;
    const navBottom = document.querySelector('.bottom-nav')?.offsetHeight || 60;
    const h = window.innerHeight - navTop - chips - navBottom;

    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.right = '0';
    el.style.bottom = '0';
    el.style.minHeight = Math.max(h, 300) + 'px';

    const RIO = { lat: -22.9519, lng: -43.2105 };
    map = new google.maps.Map(el, {
      center: RIO,
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_BOTTOM,
      },
      styles: DARK_STYLE,
    });

    infoWindow = new google.maps.InfoWindow();

    // Ocultar loading overlay
    const loading = document.getElementById('map-loading');
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => { loading.style.display = 'none'; }, 300);
    }

    return map;
  }

  // ── MARCADORES ──
  function setMarkers(restaurantes, isFavFn) {
    if (!map) return;

    markers.forEach(m => m.setMap(null));
    markers = [];

    restaurantes.forEach(r => {
      if (!r.coordenadas?.lat || !r.coordenadas?.lng) return;

      const isFav  = isFavFn?.(r.id);
      const isUser = r.origen === 'usuario';

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
          document.getElementById(`iw-${r.id}`)
            ?.addEventListener('click', () => {
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
    return `
      <div style="font-family:'Inter',sans-serif;background:#1e1e1e;color:#f0f0f0;
        border-radius:12px;padding:13px 15px;min-width:190px;max-width:250px;">
        <div style="font-size:24px;margin-bottom:6px">${r.emoji||'🍽️'}</div>
        <div style="font-size:14px;font-weight:700;line-height:1.3">${r.nombre}</div>
        <div style="font-size:12px;color:#777;margin-top:3px">${r.barrio} · ${r.precio}</div>
        <div style="font-size:12px;color:#EF9F27;margin-top:5px">
          ★ ${r.rating}
          <span style="color:#555"> · ${(r.votos||0).toLocaleString()} reseñas</span>
        </div>
        <button id="iw-${r.id}" style="
          margin-top:10px;width:100%;background:#1D9E75;color:#fff;
          border:none;border-radius:8px;padding:9px;
          font-size:13px;font-weight:600;
          font-family:'Inter',sans-serif;cursor:pointer;">
          Ver ficha →
        </button>
      </div>`;
  }

  // ── BUSCAR LUGAR (para añadir restaurante) ──
  async function searchPlace(input) {
    await loadScript();

    // Necesitamos un mapa o un div para PlacesService
    const container = map || (() => {
      const d = document.createElement('div');
      d.style.display = 'none';
      document.body.appendChild(d);
      return d;
    })();

    const svc = new google.maps.places.PlacesService(container);

    // Limpiar el input: si es URL, extraer nombre
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
            reject(new Error('No se encontró el restaurante. Prueba con el nombre exacto.'));
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
            'opening_hours', 'geometry', 'international_phone_number', 'website',
          ],
        },
        (place, status) => {
          if (status !== 'OK' || !place) {
            reject(new Error('No se pudieron obtener los detalles'));
            return;
          }
          resolve({
            nombre:          place.name,
            direccion:       place.formatted_address,
            rating:          place.rating || 0,
            votos:           place.user_ratings_total || 0,
            telefono:        place.international_phone_number || '',
            web:             place.website || '',
            coordenadas: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            },
            horario:         parseHorario(place.opening_hours?.periods),
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
      const oh  = String(p.open.hours).padStart(2, '0');
      const om  = String(p.open.minutes).padStart(2, '0');
      const ch  = String(p.close?.hours ?? 23).padStart(2, '0');
      const cm  = String(p.close?.minutes ?? 59).padStart(2, '0');
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
    try { await loadScript(); } catch(e) { /* silencioso */ }
  }

  // ── ESTILO OSCURO ──
  const DARK_STYLE = [
    { elementType: 'geometry',            stylers: [{ color: '#1a1a1a' }] },
    { elementType: 'labels.text.stroke',  stylers: [{ color: '#141414' }] },
    { elementType: 'labels.text.fill',    stylers: [{ color: '#666' }] },
    { featureType: 'road', elementType: 'geometry',         stylers: [{ color: '#2a2a2a' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#555' }] },
    { featureType: 'water',   elementType: 'geometry',      stylers: [{ color: '#0d1f2d' }] },
    { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#444' }] },
  ];

  return { init, setMarkers, centerOnUser, searchPlace, preload };
})();
