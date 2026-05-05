/**
 * maps.js — Maps se carga desde index.html
 */
const Maps = (() => {

  let map = null;
  let markers = [];
  let infoWindow = null;
  let onSelect = null;

  function whenReady() {
    return new Promise(resolve => {
      if (window.__mapsApiReady && window.google && window.google.maps) {
        resolve();
        return;
      }
      window.__mapsApiCallback = resolve;
    });
  }

  async function init(containerId, selectCallback) {
    onSelect = selectCallback;
    await whenReady();

    const el = document.getElementById(containerId);
    if (!el) return;

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

    infoWindow = new google.maps.InfoWindow({
      maxWidth: 260,
    });

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
        icon: markerIcon(isFavFn?.(r.id), r.origen === 'usuario'),
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
    return `<div style="
      font-family:'Inter',sans-serif;
      background:#1e1e1e;
      color:#f0f0f0;
      border-radius:14px;
      padding:14px 16px;
      min-width:200px;
      max-width:250px;
    ">
      <div style="font-size:26px;margin-bottom:8px;line-height:1">${r.emoji||'🍽️'}</div>
      <div style="font-size:15px;font-weight:700;line-height:1.3;margin-bottom:3px">${r.nombre}</div>
      <div style="font-size:12px;color:#777;margin-bottom:6px">${r.barrio} · ${r.precio}</div>
      <div style="font-size:13px;color:#EF9F27;margin-bottom:12px">
        ★ ${r.rating}
        <span style="color:#555;font-size:12px"> · ${(r.votos||0).toLocaleString()} reseñas</span>
      </div>
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
        letter-spacing:0.01em;
      ">Ver ficha →</button>
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

  function centerOnUser(lat, lng) {
    if (!map) return;
    map.setCenter({ lat, lng });
    map.setZoom(15);
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

  return { init, setMarkers, centerOnUser, searchPlace, preload };
})();
