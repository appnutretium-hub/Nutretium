// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — pruebas de las cuentas de cliente
//
//   npm run test:cuentas
//
// Cubre lo que puede salir caro en netlify/functions/auth.js:
//
//   · que nadie se dé de alta como administrador (el rol se calcula, no se pide);
//   · que editar la ficha NO pueda cambiar el correo, el id ni la contraseña;
//   · que el texto que acaba en la web y en los correos venga limpio;
//   · que probar contraseñas a ciegas se frene, y que frene igual para correos
//     que no existen (si no, la diferencia de respuesta diría cuáles lo están).
//
// Sin Blobs configurado, auth.js guarda en memoria: las pruebas no tocan datos
// reales.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres-de-sobra';
process.env.URL = 'https://nutretium.com';
process.env.ADMIN_EMAILS = 'jefa@nutretium.com';

const { signJWT } = require('../netlify/lib/jwt');
const { handler } = require('../netlify/functions/auth');

const CLIENTE = 'cliente@example.com';
const CLAVE = 'contrasena-larga-de-prueba';

let correctas = 0;
let fallidas = 0;

function comprueba(descripcion, condicion, detalle) {
  if (condicion) {
    correctas++;
    console.log(`  OK  ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  FALLA  ${descripcion}${detalle ? `\n         ${detalle}` : ''}`);
  }
}

async function llama(cuerpo) {
  const respuesta = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(cuerpo) });
  return { estado: respuesta.statusCode, datos: JSON.parse(respuesta.body || '{}') };
}

// Una dirección de envío válida, para no repetirla en cada llamada.
const DIRECCION = {
  calle: 'Calle la Albericia 1',
  piso: '3º B',
  cp: '39012',
  localidad: 'Santander',
  provincia: 'Cantabria',
  pais: 'España',
};

(async () => {
  console.log('\n── Alta ──');
  let token;
  {
    const alta = await llama({
      action: 'register', name: 'Ana', surname: 'García',
      email: CLIENTE, password: CLAVE, phone: '600 123 456',
      direccion: DIRECCION,
      // Un cliente listo probando a colarse:
      role: 'admin',
    });
    comprueba('el registro funciona', alta.estado === 201, JSON.stringify(alta.datos).slice(0, 120));
    comprueba('mandar role en el registro NO asciende a nadie', alta.datos.user.role === 'cliente',
      alta.datos.user.role);
    comprueba('el alta devuelve la dirección', alta.datos.user.direccionCompleta === true,
      JSON.stringify(alta.datos.user.direccion));
    token = alta.datos.user.token;

    const repetido = await llama({
      action: 'register', name: 'Otra', email: CLIENTE, password: CLAVE, direccion: DIRECCION,
    });
    comprueba('no se puede repetir el correo', repetido.estado === 409);
  }

  console.log('\n── La dirección de envío es obligatoria al darse de alta ──');
  {
    // Sin dirección no se puede enviar el pedido, así que no hay cuenta.
    const casos = [
      ['sin dirección ninguna', undefined],
      ['sin calle', { ...DIRECCION, calle: '' }],
      ['sin código postal', { ...DIRECCION, cp: '' }],
      ['código postal de 4 cifras', { ...DIRECCION, cp: '3901' }],
      ['código postal con letras', { ...DIRECCION, cp: '39O12' }],
      ['sin localidad', { ...DIRECCION, localidad: '' }],
      ['sin provincia', { ...DIRECCION, provincia: '' }],
      ['calle con etiquetas HTML', { ...DIRECCION, calle: '<img src=x onerror=alert(1)>' }],
      ['calle kilométrica', { ...DIRECCION, calle: 'x'.repeat(121) }],
    ];
    for (const [descripcion, dir] of casos) {
      const r = await llama({
        action: 'register', name: 'Nuevo', email: 'nuevo' + Math.random() + '@ejemplo.com',
        password: CLAVE, direccion: dir,
      });
      comprueba(`${descripcion}: no se registra`, r.estado === 400, `${r.estado} ${r.datos.error || ''}`);
    }

    // El piso sí es opcional: no todo el mundo vive en uno.
    const sinPiso = await llama({
      action: 'register', name: 'Chalet', email: 'chalet@ejemplo.com', password: CLAVE,
      direccion: { ...DIRECCION, piso: '' },
    });
    comprueba('el piso es opcional', sinPiso.estado === 201, `${sinPiso.estado} ${sinPiso.datos.error || ''}`);
  }

  console.log('\n── El rol sale de ADMIN_EMAILS ──');
  {
    const perfil = await llama({ action: 'profile', token });
    comprueba('un cliente es "cliente"', perfil.datos.user.role === 'cliente', perfil.datos.user.role);

    // El mismo código, con el correo que sí está en la lista.
    const tokenJefa = signJWT({ sub: 'x', email: 'jefa@nutretium.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const suyo = await llama({ action: 'profile', token: tokenJefa });
    comprueba('quien no existe en el almacén no tiene ficha', suyo.estado === 404, String(suyo.estado));
  }

  console.log('\n── Editar la ficha ──');
  {
    const sinToken = await llama({ action: 'update', name: 'Ana' });
    comprueba('sin token: 401', sinToken.estado === 401);

    const otroSecreto = signJWT({ sub: 'x', email: CLIENTE, exp: Math.floor(Date.now() / 1000) + 3600 },
      'otro-secreto-cualquiera-de-32-caracteres');
    const falsificado = await llama({ action: 'update', token: otroSecreto, name: 'Ana' });
    comprueba('token firmado con otro secreto: 401', falsificado.estado === 401);

    const casos = [
      ['sin nombre', { name: '' }],
      ['nombre con etiquetas HTML', { name: 'Ana <img src=x onerror=alert(1)>' }],
      ['apellidos con etiquetas HTML', { name: 'Ana', surname: '<script>' }],
      ['teléfono con letras', { name: 'Ana', phone: 'llámame' }],
      ['nombre kilométrico', { name: 'x'.repeat(61) }],
      ['teléfono kilométrico', { name: 'Ana', phone: '6'.repeat(21) }],
    ];
    for (const [descripcion, campos] of casos) {
      const r = await llama({ action: 'update', token, surname: '', phone: '', ...campos });
      comprueba(`${descripcion}: rechazado`, r.estado === 400, `${r.estado} ${r.datos.error || ''}`);
    }

    const bien = await llama({
      action: 'update', token, name: 'Ana María', surname: 'García Ruiz', phone: '+34 600 111 222',
    });
    comprueba('un cambio válido se guarda', bien.estado === 200, JSON.stringify(bien.datos).slice(0, 120));
    comprueba('devuelve los datos nuevos',
      bien.datos.user.name === 'Ana María' && bien.datos.user.phone === '+34 600 111 222');

    // Lo que NO debe poder cambiarse desde el cuerpo de la petición.
    const colandose = await llama({
      action: 'update', token, name: 'Ana', surname: '', phone: '',
      email: 'jefa@nutretium.com', id: 'otro-id', role: 'admin',
      passwordHash: 'lo-que-sea', createdAt: '1999-01-01',
    });
    comprueba('no se puede cambiar el correo desde la petición',
      colandose.datos.user.email === CLIENTE, colandose.datos.user.email);

    // La dirección se edita por aquí, y se valida igual que en el alta.
    const dirMala = await llama({
      action: 'update', token, name: 'Ana', surname: '', phone: '',
      direccion: { ...DIRECCION, cp: 'no' },
    });
    comprueba('una dirección inválida en la edición: 400', dirMala.estado === 400,
      `${dirMala.estado} ${dirMala.datos.error || ''}`);

    const dirNueva = await llama({
      action: 'update', token, name: 'Ana', surname: '', phone: '',
      direccion: { ...DIRECCION, localidad: 'Torrelavega', cp: '39300' },
    });
    comprueba('se puede cambiar la dirección',
      dirNueva.estado === 200 && dirNueva.datos.user.direccion.localidad === 'Torrelavega',
      JSON.stringify(dirNueva.datos.user.direccion));

    // Y si no se manda, se conserva: media dirección dejaría la ficha en un
    // estado que el cobro rechaza sin que nadie lo haya pedido.
    const sinTocarla = await llama({ action: 'update', token, name: 'Ana', surname: '', phone: '' });
    comprueba('no mandar dirección la conserva',
      sinTocarla.datos.user.direccion.localidad === 'Torrelavega',
      JSON.stringify(sinTocarla.datos.user.direccion));
    comprueba('no se puede ascender a administrador editando la ficha',
      colandose.datos.user.role === 'cliente', colandose.datos.user.role);
    comprueba('el id no se toca', colandose.datos.user.id !== 'otro-id');

    // Y la contraseña sigue siendo la de antes.
    const entra = await llama({ action: 'login', email: CLIENTE, password: CLAVE });
    comprueba('la contraseña sobrevive a editar la ficha', entra.estado === 200, String(entra.estado));
    comprueba('el nombre editado se conserva', entra.datos.user.name === 'Ana', entra.datos.user.name);
  }

  console.log('\n── Freno a la fuerza bruta ──');
  {
    const victima = 'freno@example.com';
    let ultima;
    for (let i = 0; i < 5; i++) {
      ultima = await llama({ action: 'login', email: victima, password: 'me-la-invento' });
    }
    comprueba('los cinco primeros intentos responden 401', ultima.estado === 401, String(ultima.estado));

    const sexto = await llama({ action: 'login', email: victima, password: 'me-la-invento' });
    comprueba('el sexto se frena con 429', sexto.estado === 429, String(sexto.estado));
    comprueba('y dice cuánto hay que esperar', /minutos/.test(sexto.datos.error || ''), sexto.datos.error);
    comprueba('frena también un correo que no existe: no revela cuáles están registrados',
      sexto.estado === 429);

    // Y a una cuenta real, aunque acierte la contraseña, mientras dure el castigo.
    for (let i = 0; i < 5; i++) await llama({ action: 'login', email: CLIENTE, password: 'mal' });
    const conLaBuena = await llama({ action: 'login', email: CLIENTE, password: CLAVE });
    comprueba('durante el castigo no entra ni con la contraseña correcta', conLaBuena.estado === 429,
      String(conLaBuena.estado));
  }

  console.log(`\n${correctas} correctas, ${fallidas} fallidas.`);
  if (fallidas) process.exitCode = 1;
})().catch((err) => {
  console.error('\nLa prueba se rompió:', err);
  process.exitCode = 1;
});
