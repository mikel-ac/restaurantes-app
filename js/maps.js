/**
 * maps.js — Maps se carga desde index.html, aquí solo lo usamos
 */
const Maps = (() => {

  let map = null;
  let markers = [];
  let infoWindow = null;
  let onSelect = null;

  // Espera a que Google Maps esté listo (callback definido en index.html)
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

    infoWindow = new google.maps.InfoWindow();

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
    return `<div style="font-family:'Inter',sans-serif;background:#1e1e1e;color:#f0f0f0;
      border-radius:12px;padding:13px 15px;min-width:190px;max-width:250px;">
      <div style="font-size:24px;margin-bottom:6px">${r.emoji||'🍽️'}</div>
      <div style="font-size:14px;font-weight:700;line-height:1.3">${r.nombre}</div>
      <div style="font-size:12px;color:#777;margin-top:3px">${r.barrio} · ${r.precio}</div>
      <div style="font-size:12px;color:#EF9F27;margin-top:5px">★ ${r.rating}
        <span style="color:#555"> · ${(r.votos||0).toLocaleString()} reseñas</span></div>
      <button id="iw-${r.id}" style="margin-top:10px;width:100%;background:#1D9E75;
        color:#fff;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:600;
        font-family:'Inter',sans-serif;cursor:pointer;">Ver ficha →</button>
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

  // preload no hace nada — Maps ya se carga desde el HTML
  function preload() {}

  const DARK_STYLE = [
    { elementType:'geometry',           stylers:[{color:'#1a1a1a'}] },
    { elementType:'labels.text.stroke', stylers:[{color:'#141414'}] },
    { elementType:'labels.text.fill',   stylers:[{color:'#666'}] },
    { featureType:'road', elementType:'geometry',         stylers:[{color:'#2a2a2a'}] },
    { featureType:'road', elementType:'labels.text.fill', stylers:[{color:'#555'}] },
    { featureType:'water',   elementType:'geometry', stylers:[{color:'#0d1f2d'}] },
    { featureType:'poi',     stylers:[{visibility:'off'}] },
    { featureType:'transit', stylers:[{visibility:'off'}] },
    { featureType:'administrative', elementType:'labels.text.fill', stylers:[{color:'#444'}] },
  ];

  return { init, setMarkers, centerOnUser, searchPlace, preload };
})();
