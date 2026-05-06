# 🍽️ Mis Restaurantes — PWA Personal

App personal de restaurantes para viajes. Instalable en Android (Pixel 8).

## Estructura del proyecto

```
restaurantes-app/
├── index.html                          ← App principal
├── manifest.json                       ← PWA manifest
├── sw.js                               ← Service worker (offline)
├── netlify.toml                        ← Config despliegue
├── assets/
│   ├── css/style.css
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── js/
│   ├── app.js                          ← Lógica principal
│   ├── storage.js                      ← Favoritos, notas, wishlist
│   ├── filters.js                      ← Filtros y búsqueda
│   └── maps.js                         ← Google Maps integration
└── data/
    └── brasil/
        └── rio-de-janeiro/
            └── restaurantes.json       ← 62 restaurantes curados
```

## Configuración antes de desplegar

### 1. API Key de Google Maps
Abre `js/app.js` y reemplaza en la línea 4:
```js
window.MAPS_API_KEY = 'TU_API_KEY_AQUI';
```

### 2. Restricciones de la API Key en Google Cloud Console
Ve a: console.cloud.google.com → Credenciales → tu API Key → Editar
- En "Restricciones de aplicación" → selecciona "Referentes HTTP"
- Añade estos dominios:
  - `https://tu-app.netlify.app/*`
  - `http://localhost/*` (para desarrollo local)

## Despliegue en Netlify

1. Sube esta carpeta a un repositorio de GitHub
2. En Netlify: "New site from Git" → selecciona el repositorio
3. Build settings: dejar todo vacío (es HTML estático)
4. Deploy site

Cada vez que hagas push a GitHub, Netlify despliega automáticamente.

## Instalar en Android (Pixel 8)

1. Abre la URL de Netlify en Chrome
2. Aparece un banner "Añadir a pantalla de inicio"
3. Si no aparece: menú ⋮ → "Añadir a pantalla de inicio"

## Añadir nuevas ciudades

1. Crea el JSON en `data/[pais]/[ciudad]/restaurantes.json`
2. Añade la ruta en `js/app.js` en el array `DATA_SOURCES`:
```js
{ path: 'data/brasil/salvador/restaurantes.json', ciudad: 'Salvador', region: 'Bahía', pais: 'Brasil' },
```
3. Haz push a GitHub → Netlify despliega solo

## Estructura de un restaurante en el JSON

```json
{
  "id": "rio-001",
  "nombre": "Nombre del restaurante",
  "pais": "Brasil",
  "region": "Río de Janeiro",
  "municipio": "Río de Janeiro",
  "barrio": "Ipanema",
  "tipo_cocina": "Brasileña",
  "precio": "€€",
  "precio_medio_brl": 70,
  "ambiente": ["casual", "muy local"],
  "tags": ["muy local", "vistas"],
  "emoji": "🦞",
  "rating": 4.5,
  "votos": 1200,
  "picar": false,
  "menu_del_dia": false,
  "coordenadas": { "lat": -22.9838, "lng": -43.1997 },
  "horario": {
    "lunes":    { "abre": "12:00", "cierra": "23:00" },
    "martes":   { "abre": "12:00", "cierra": "23:00" },
    "miercoles":{ "abre": "12:00", "cierra": "23:00" },
    "jueves":   { "abre": "12:00", "cierra": "23:00" },
    "viernes":  { "abre": "12:00", "cierra": "00:00" },
    "sabado":   { "abre": "12:00", "cierra": "00:00" },
    "domingo":  { "abre": "12:00", "cierra": "22:00" }
  },
  "descripcion": "Descripción del restaurante...",
  "platos_destacados": ["plato 1", "plato 2"],
  "tip_local": "Consejo local...",
  "resena_destacada": "Reseña destacada...",
  "google_place_id": "",
  "web": "",
  "telefono": "",
  "origen": "curado"
}
```

Para días cerrados usa `null`:
```json
"lunes": null

```
