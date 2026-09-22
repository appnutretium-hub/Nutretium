/**
 * Configuración de Tailwind — NUTRETIUM
 *
 * Es la misma que estaba escrita en línea en index.html cuando Tailwind se
 * cargaba desde cdn.tailwindcss.com. Ahora el CSS se compila en el build
 * (`npm run build:css`) y el navegador solo descarga la hoja ya generada.
 *
 * `content` le dice a Tailwind dónde buscar clases: si añades un archivo nuevo
 * con clases de Tailwind, inclúyelo aquí o sus estilos no se generarán.
 */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

// Primer punto ejecutable del build de Netlify. En local/CI normal el guard se
// auto-desactiva; en un deploy de producción valida el origen antes de compilar.
execFileSync(process.execPath, [path.join(__dirname, 'scripts', 'verify-production-deploy-origin.js')], {
  stdio: 'inherit',
  env: process.env
});

module.exports = {
  // products-data.js entra aquí porque el campo badgeColor de cada producto es
  // una clase de Tailwind: si algún día se pone una etiqueta a un producto, su
  // color tiene que existir en el CSS compilado.
  content: ['./index.html', './app.js', './animations.js', './products-data.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          gold:      '#D4AF37',
          goldlight: '#F0D060',
          golddark:  '#A07820',
          dark:      '#0a0a0a',
          card:      '#111111',
          border:    '#2a2200',
          muted:     '#8a7a50',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      screens: {
        xs: '480px',
      },
    },
  },
  plugins: [],
};
