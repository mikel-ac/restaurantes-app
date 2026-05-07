/**
 * filters.js
 * Toda la lógica de filtrado, búsqueda, ordenación y cálculo de estado abierto/cerrado.
 * Sin dependencias de DOM — devuelve arrays filtrados.
 */

const Filters = (() => {

  // ─── TIMEZONE POR CIUDAD ───
  const TIMEZONES = {
    'Río de Janeiro': 'America/Sao_Paulo',
    'Salvador':       'America/Bahia',
    'São Paulo':      'America/Sao_Paulo',
  };

  const getLocalTime = (municipio) => {
    const tz = TIMEZONES[municipio] || 'America/Sao_Paulo';
    return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  };

  const DAYS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

  const getOpenStatus = (restaurante) => {
    const now   = getLocalTime(restaurante.municipio);
    const day   = DAYS[now.getDay()];
    const mins  = now.getHours() * 60 + now.getMinutes();
    const sched = restaurante.horario?.[day];

    if (!sched) return { open: false, label: 'Cerrado hoy' };

    const [oh, om] = sched.abre.split(':').map(Number);
    const [ch, cm] = sched.cierra.split(':').map(Number);
    const open = oh * 60 + om;
    let close  = ch * 60 + cm;
    if (close < open) close += 24 * 60; // cierra pasada medianoche

    if (mins >= open && mins < close) {
      // Abierto — calcular cuándo cierra
      const closeH = ch, closeM = cm;
      return { open: true, label: `Abierto · cierra ${closeH}h${closeM > 0 ? closeM : ''}` };
    } else if (mins < open) {
      return { open: false, label: `Cerrado · abre ${sched.abre}h` };
    } else {
      // Ya cerró hoy
      return { open: false, label: `Cerrado · abre mañana` };
    }
  };

  // ─── CHIPS RÁPIDOS ───
  const CHIPS = {
    'muy local':  r => r.tags?.includes('muy local'),
    'michelin':   r => r.tags?.includes('michelin') || r.tags?.includes('Michelin'),
    'vistas':     r => r.tags?.includes('vistas'),
    'nocturno':   r => r.ambiente?.includes('nocturno') || r.tags?.includes('nocturno'),
    'desayuno':   r => r.ambiente?.includes('desayuno') || r.tags?.includes('desayuno'),
    'picar':      r => r.picar === true,
    'menú':       r => r.menu_del_dia === true,
  };

  // ─── FUNCIÓN PRINCIPAL ───
  const apply = (restaurantes, state, userStorage) => {
    let result = [...restaurantes];

    // Solo favoritos
    if (state.favOnly) {
      result = result.filter(r => userStorage.isFav(r.id));
    }

    // Búsqueda texto
    if (state.query) {
      const q = state.query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      result = result.filter(r => {
        const cocinasArr = r.cocinas || (r.tipo_cocina ? [r.tipo_cocina] : []);
        const hay = [r.nombre, r.barrio, ...cocinasArr, r.descripcion, ...(r.tags||[])]
          .join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return hay.includes(q);
      });
    }

    // Chips activos (AND entre chips)
    if (state.chips.length > 0) {
      state.chips.forEach(chip => {
        const fn = CHIPS[chip];
        if (fn) result = result.filter(fn);
      });
    }

    // Filtro barrio
    if (state.barrio) {
      result = result.filter(r => r.barrio === state.barrio);
    }

    // Filtro cocina — busca en array cocinas o en tipo_cocina string
    if (state.cocina) {
      const q = state.cocina.toLowerCase();
      result = result.filter(r => {
        const arr = r.cocinas || (r.tipo_cocina ? [r.tipo_cocina] : []);
        return arr.some(c => c.toLowerCase().includes(q));
      });
    }

    // Filtro precio
    if (state.precio) {
      result = result.filter(r => r.precio === state.precio);
    }

    // Filtro ambiente
    if (state.ambiente) {
      result = result.filter(r => r.ambiente?.includes(state.ambiente));
    }

    // Solo abiertos ahora
    if (state.soloAbiertos) {
      result = result.filter(r => getOpenStatus(r).open);
    }

    // Ordenación
    if (state.sort === 'rating') {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (state.sort === 'nombre') {
      result.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } else if (state.sort === 'precio_asc') {
      const order = { '€': 1, '€€': 2, '€€€': 3, '€€€€': 4 };
      result.sort((a, b) => (order[a.precio]||5) - (order[b.precio]||5));
    } else if (state.sort === 'proximidad' && state.userLat && state.userLng) {
      result.sort((a, b) => {
        const da = dist(state.userLat, state.userLng, a.coordenadas.lat, a.coordenadas.lng);
        const db = dist(state.userLat, state.userLng, b.coordenadas.lat, b.coordenadas.lng);
        return da - db;
      });
    }

    return result;
  };

  // Distancia Haversine en km
  const dist = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // ─── OBTENER OPCIONES ÚNICAS ───
  const getBarrios = (restaurantes) =>
    [...new Set(restaurantes.map(r => r.barrio))].sort();

  const getCocinas = (restaurantes) => {
    const all = restaurantes.flatMap(r => {
      const arr = r.cocinas || (r.tipo_cocina ? [r.tipo_cocina] : []);
      return Array.isArray(arr) ? arr : [arr];
    }).filter(Boolean);
    return [...new Set(all)].sort();
  };

  const getPrecios = () => ['€', '€€', '€€€', '€€€€'];

  const getAmbientes = (restaurantes) => {
    const all = restaurantes.flatMap(r => r.ambiente || []);
    return [...new Set(all)].sort();
  };

  return { apply, getOpenStatus, getBarrios, getCocinas, getPrecios, getAmbientes, CHIPS };
})();
