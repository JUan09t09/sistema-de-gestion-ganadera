// ============================================================
// MI FINCA — Gestión Ganadera v2.0
// app.js — Lógica completa con módulos dinámicos por perfil
// ============================================================

// ============================================================
// PERFILES DISPONIBLES
// Cada perfil define qué módulos del menú se muestran
// ============================================================
const PERFILES = {
  lechero: {
    nombre: '🥛 Vacas lecheras',
    desc:   'Solo vacas de leche — producción, reproducción y salud',
    modulos: ['dashboard','animales','leche','reproduccion','salud','alimentacion','potreros','finanzas','inventario'],
    tipos:   ['bovino']
  },
  carne: {
    nombre: '🥩 Ganado de carne',
    desc:   'Bovinos para engorde — control de peso, compra/venta y rentabilidad',
    modulos: ['dashboard','animales','carne','salud','alimentacion','potreros','finanzas','inventario'],
    tipos:   ['bovino']
  },
  equino: {
    nombre: '🐎 Solo caballos',
    desc:   'Equinos — salud, reproducción y manejo sin módulos de leche',
    modulos: ['dashboard','animales','reproduccion','salud','alimentacion','potreros','finanzas','inventario'],
    tipos:   ['equino']
  },
  mixto: {
    nombre: '🐄🐎 Mixto (vacas + caballos)',
    desc:   'Bovinos y equinos — leche, carne y reproducción',
    modulos: ['dashboard','animales','leche','carne','reproduccion','salud','alimentacion','potreros','finanzas','inventario'],
    tipos:   ['bovino','equino']
  },
  completo: {
    nombre: '🌿 Finca completa',
    desc:   'Todos los módulos disponibles',
    modulos: ['dashboard','animales','leche','carne','reproduccion','salud','alimentacion','potreros','finanzas','inventario'],
    tipos:   ['bovino','equino']
  }
};

const TITULOS_MOD = {
  dashboard:    '🏠 Panel principal',
  animales:     '🐄 Mis animales',
  leche:        '🥛 Producción de leche',
  carne:        '🥩 Ganado de carne',
  reproduccion: '🔁 Reproducción',
  salud:        '💉 Salud y vacunas',
  alimentacion: '🌾 Alimentación',
  potreros:     '🌿 Potreros y pesebreras',
  finanzas:     '💰 Control financiero',
  inventario:   '📦 Inventario general',
};

const NAV_ITEMS = {
  dashboard:    { icon: '🏠', label: 'Panel principal' },
  animales:     { icon: '🐄', label: 'Mis animales' },
  leche:        { icon: '🥛', label: 'Producción leche' },
  carne:        { icon: '🥩', label: 'Ganado de carne' },
  reproduccion: { icon: '🔁', label: 'Reproducción' },
  salud:        { icon: '💉', label: 'Salud y vacunas', id: 'nav-salud' },
  alimentacion: { icon: '🌾', label: 'Alimentación' },
  potreros:     { icon: '🌿', label: 'Potreros y pesebreras' },
  finanzas:     { icon: '💰', label: 'Finanzas' },
  inventario:   { icon: '📦', label: 'Inventario' },
};

// ============================================================
// KEYS Y ESTADO GLOBAL
// ============================================================
const CONFIG_KEY    = 'miFincaFirebaseConfig';
const DB_CACHE_KEY  = 'miFincaDBCache';

let firebaseApp      = null;
let auth             = null;
let firestore        = null;
let usuarioActual    = null;
let db               = crearDBVacia();
let idAnimalEnEdicion = null;
let syncTimeout      = null;
let modoTab          = 'login';
let perfilActual     = 'completo';

// ============================================================
// ESTRUCTURA DE BASE DE DATOS
// ============================================================
function crearDBVacia() {
  return {
    config: {
      nombre: 'Mi Finca', propietario: 'Administrador', lugar: '',
      perfil: 'completo'  // perfil del usuario
    },
    animales:     [],
    leche:        [],
    reproductivo: [],
    salud:        [],
    alimentacion: [],
    finanzas:     [],
    pesajes:      []   // historial de pesajes para ganado de carne
  };
}

function normalizarDB(datos) {
  const base   = crearDBVacia();
  const seguro = (datos && typeof datos === 'object') ? datos : {};
  return {
    config:       Object.assign({}, base.config, seguro.config || {}),
    animales:     Array.isArray(seguro.animales)     ? seguro.animales     : [],
    leche:        Array.isArray(seguro.leche)        ? seguro.leche        : [],
    reproductivo: Array.isArray(seguro.reproductivo) ? seguro.reproductivo : [],
    salud:        Array.isArray(seguro.salud)        ? seguro.salud        : [],
    alimentacion: Array.isArray(seguro.alimentacion) ? seguro.alimentacion : [],
    finanzas:     Array.isArray(seguro.finanzas)     ? seguro.finanzas     : [],
    pesajes:      Array.isArray(seguro.pesajes)      ? seguro.pesajes      : []
  };
}

// ============================================================
// CONFIGURACIÓN FIREBASE
// ============================================================
function parsearFirebaseConfig(texto) {
  try {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No se encontró objeto JSON');
    const jsonStr = jsonMatch[0]
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
      .replace(/'/g, '"');
    return JSON.parse(jsonStr);
  } catch(e) {
    const config = {};
    const campos = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
    for (const campo of campos) {
      const m = texto.match(new RegExp(campo + '\\s*:\\s*["\']([^"\']+)["\']'));
      if (m) config[campo] = m[1];
    }
    if (!config.apiKey) throw new Error('No se pudo extraer apiKey');
    return config;
  }
}

function validarFirebaseConfig(cfg) {
  const campos = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  const faltantes = campos.filter(function(campo) {
    return !cfg[campo] || String(cfg[campo]).trim() === '';
  });
  if (faltantes.length > 0) throw new Error('Faltan campos: ' + faltantes.join(', '));
  const placeholders = Object.values(cfg).filter(function(v) {
    return typeof v === 'string' && v.replace(/\s+/g,'') === '...';
  });
  if (placeholders.length > 0) throw new Error('La configuración parece de ejemplo.');
  return true;
}

function guardarConfigFirebase() {
  const texto  = document.getElementById('cfg-paste').value.trim();
  const errDiv = document.getElementById('cfg-error');
  errDiv.style.display = 'none';
  if (!texto) { errDiv.textContent = 'Pega la configuración de Firebase'; errDiv.style.display='block'; return; }
  try {
    const cfg = parsearFirebaseConfig(texto);
    validarFirebaseConfig(cfg);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    inicializarFirebase(cfg);
  } catch(e) {
    errDiv.textContent = '⚠️ ' + e.message;
    errDiv.style.display = 'block';
  }
}

function cambiarFirebase() {
  document.getElementById('pantalla-login').style.display      = 'none';
  document.getElementById('pantalla-configurar').style.display = 'flex';
}

function inicializarFirebase(config) {
  try {
    if (firebase.apps.length > 0) firebase.apps.forEach(function(a){ a.delete(); });
    firebaseApp = firebase.initializeApp(config);
    auth        = firebase.auth();
    firestore   = firebase.firestore();
    document.getElementById('pantalla-configurar').style.display = 'none';
    mostrarCargando('Conectando con Firebase...');
    auth.onAuthStateChanged(function(user) {
      if (user) { usuarioActual = user; cargarDatosNube(user.uid); }
      else      { usuarioActual = null; mostrarLogin(); }
    });
  } catch(e) { alert('Error Firebase: ' + e.message); }
}

// ============================================================
// INICIO
// ============================================================
// ============================================================
// FIREBASE CONFIG — ya configurado, no requiere setup manual
// ============================================================
const FIREBASE_CONFIG_HARDCODED = {
  apiKey:            "AIzaSyAk1p71Kws4P6FBJINkpvat7PtXlYR3oA0",
  authDomain:        "finca-e350f.firebaseapp.com",
  projectId:         "finca-e350f",
  storageBucket:     "finca-e350f.firebasestorage.app",
  messagingSenderId: "465392032945",
  appId:             "1:465392032945:web:99e6eb26e5388291f01690",
  measurementId:     "G-JC35C3W5Y1"
};

window.addEventListener('DOMContentLoaded', function() {
  // Siempre usar la config hardcodeada — sin pantalla de setup
  inicializarFirebase(FIREBASE_CONFIG_HARDCODED);

  document.querySelectorAll('.modal-overlay').forEach(function(m) {
    m.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('open'); });
  });
  document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', cerrarSidebar);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') cerrarSidebar(); });

  // Construir el selector de perfil en el formulario de registro
  construirSelectorPerfil();
});

// ============================================================
// SELECTOR DE PERFIL EN REGISTRO
// ============================================================
function construirSelectorPerfil() {
  const cont = document.getElementById('selector-perfil');
  if (!cont) return;
  cont.innerHTML = Object.entries(PERFILES).map(function(entry) {
    const key = entry[0], p = entry[1];
    return '<label class="perfil-opcion" onclick="seleccionarPerfil(\'' + key + '\')" id="perfil-lbl-' + key + '">' +
      '<input type="radio" name="perfil" value="' + key + '"' + (key === 'lechero' ? ' checked' : '') + '> ' +
      '<span class="perfil-nombre">' + p.nombre + '</span>' +
      '<span class="perfil-desc">' + p.desc + '</span>' +
      '</label>';
  }).join('');
}

function seleccionarPerfil(key) {
  document.querySelectorAll('.perfil-opcion').forEach(function(el){
    el.classList.remove('selected');
  });
  const lbl = document.getElementById('perfil-lbl-' + key);
  if (lbl) lbl.classList.add('selected');
  const radio = document.querySelector('input[name="perfil"][value="' + key + '"]');
  if (radio) radio.checked = true;
}

function getPerfilSeleccionado() {
  const radio = document.querySelector('input[name="perfil"]:checked');
  return radio ? radio.value : 'lechero';
}

// ============================================================
// PANTALLAS
// ============================================================
function mostrarConfiguracion() {
  ['pantalla-cargando','pantalla-login','app-principal'].forEach(function(id){
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('pantalla-configurar').style.display = 'flex';
}

function mostrarCargando(texto) {
  ['pantalla-configurar','pantalla-login','app-principal'].forEach(function(id){
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('pantalla-cargando').style.display = 'flex';
  document.getElementById('texto-cargando').textContent = texto || 'Cargando...';
}

function mostrarLogin() {
  document.getElementById('pantalla-cargando').style.display = 'none';
  document.getElementById('app-principal').style.display     = 'none';
  document.getElementById('pantalla-login').style.display    = 'flex';
  const el = document.getElementById('login-email');
  if (el && el.focus) el.focus();
}

function mostrarApp(user) {
  document.getElementById('pantalla-cargando').style.display = 'none';
  document.getElementById('pantalla-login').style.display    = 'none';
  document.getElementById('app-principal').style.display     = 'block';

  perfilActual = db.config.perfil || 'completo';
  construirNavegacion();

  const nombre = db.config.propietario || user.displayName || 'Usuario';
  document.getElementById('nombre-usuario').textContent       = nombre;
  document.getElementById('email-usuario').textContent        = user.email;
  document.getElementById('avatar-inicial').textContent       = nombre[0].toUpperCase();
  document.getElementById('sidebar-titulo-finca').textContent = '🌿 ' + db.config.nombre;
  renderDashboard();
}

// ============================================================
// NAVEGACIÓN DINÁMICA POR PERFIL
// ============================================================
function construirNavegacion() {
  const perfil  = PERFILES[perfilActual] || PERFILES.completo;
  const navEl   = document.getElementById('nav-dinamico');
  if (!navEl) return;

  // Evitar que módulos repetidos generen elementos duplicados en el menú
  const modulosUnicos = deduplicar(perfil.modulos || []);

  navEl.innerHTML = modulosUnicos.map(function(mod) {
    const n = NAV_ITEMS[mod];
    if (!n) return '';
    return '<div class="nav-item' + (mod==='dashboard'?' active':'') + '" ' +
      'onclick="mostrarPagina(\'' + mod + '\')" ' +
      (n.id ? 'id="' + n.id + '"' : '') + '>' +
      '<span class="icon">' + n.icon + '</span> ' + n.label +
      '</div>';
  }).join('');

  // Mostrar/ocultar páginas según perfil (usar la lista deduplicada)
  document.querySelectorAll('.page').forEach(function(pg) {
    const nombre = pg.id.replace('page-','');
    pg.style.display = modulosUnicos.indexOf(nombre) !== -1 ? '' : 'none';
  });

  // Eliminar entradas visualmente duplicadas por texto (defensa extra)
  setTimeout(function(){
    try {
      const seen = {};
      Array.from(navEl.children).forEach(function(child){
        const key = (child.textContent||'').trim();
        if (!key) return;
        if (seen[key]) child.remove(); else seen[key]=true;
      });
    } catch(e){ /* no crítico */ }
  }, 30);
}

// ============================================================
// AUTENTICACIÓN
// ============================================================
function cambiarTab(tab) {
  modoTab = tab;
  document.getElementById('tab-login').classList.toggle('active',    tab==='login');
  document.getElementById('tab-registro').classList.toggle('active', tab==='registro');
  document.getElementById('btn-accion-login').textContent = tab==='login' ? 'Iniciar sesión' : 'Crear cuenta';
  document.getElementById('campo-nombre').style.display   = tab==='registro' ? 'block' : 'none';
  document.getElementById('campo-finca').style.display    = tab==='registro' ? 'block' : 'none';
  document.getElementById('campo-perfil').style.display   = tab==='registro' ? 'block' : 'none';
  document.getElementById('login-error').style.display    = 'none';
  document.getElementById('login-success').style.display  = 'none';
}

function accionLogin() {
  const email  = document.getElementById('login-email').value.trim();
  const pass   = document.getElementById('login-password').value;
  const errDiv = document.getElementById('login-error');
  const sucDiv = document.getElementById('login-success');
  errDiv.style.display = 'none'; sucDiv.style.display = 'none';
  if (!email||!pass){ errDiv.textContent='Completa correo y contraseña'; errDiv.style.display='block'; return; }
  const btn = document.getElementById('btn-accion-login');
  btn.disabled = true;

  if (modoTab === 'login') {
    auth.signInWithEmailAndPassword(email, pass)
      .then(function(){ mostrarCargando('Cargando tu finca...'); })
      .catch(function(e){ btn.disabled=false; errDiv.textContent=tradError(e.code); errDiv.style.display='block'; });
  } else {
    const nombre = document.getElementById('login-nombre').value.trim() || 'Propietario';
    const finca  = document.getElementById('login-finca').value.trim()  || 'Mi Finca';
    const perfil = getPerfilSeleccionado();
    auth.createUserWithEmailAndPassword(email, pass)
      .then(function(cred) {
        return firestore.collection('usuarios').doc(cred.user.uid).set({
          config: { nombre: finca, propietario: nombre, lugar: '', perfil: perfil },
          animales:[], leche:[], reproductivo:[], salud:[], alimentacion:[], finanzas:[], pesajes:[], potreros:[],
          creadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
      })
      .then(function(){ mostrarCargando('Configurando tu finca...'); })
      .catch(function(e){ btn.disabled=false; errDiv.textContent=tradError(e.code); errDiv.style.display='block'; });
  }
}

function olvidoContrasena() {
  const email = document.getElementById('login-email').value.trim();
  if (!email){ alert('Primero ingresa tu correo'); return; }
  auth.sendPasswordResetEmail(email)
    .then(function(){
      document.getElementById('login-success').textContent   = '✅ Revisa tu correo para restablecer la contraseña';
      document.getElementById('login-success').style.display = 'block';
    })
    .catch(function(e){
      document.getElementById('login-error').textContent   = tradError(e.code);
      document.getElementById('login-error').style.display = 'block';
    });
}

function cerrarSesionBase() {
  if (!confirm('¿Cerrar sesión?')) return;
  sesionTrabajador = null;
  sessionStorage.removeItem(SESION_TRAB_KEY);
  db = crearDBVacia();
  if (usuarioActual) {
    auth.signOut().then(function() { mostrarLogin(); });
  } else {
    mostrarLogin();
  }
}

function tradError(code) {
  const m = {
    'auth/user-not-found':        'No existe cuenta con ese correo',
    'auth/wrong-password':        'Contraseña incorrecta',
    'auth/email-already-in-use':  'Ese correo ya está registrado',
    'auth/weak-password':         'La contraseña debe tener al menos 6 caracteres',
    'auth/invalid-email':         'El correo no es válido',
    'auth/too-many-requests':     'Demasiados intentos. Espera unos minutos',
    'auth/network-request-failed':'Error de conexión',
  };
  return m[code] || 'Error: ' + code;
}

// ============================================================
// FIRESTORE
// ============================================================
function cargarDatosNube(uid) {
  mostrarCargando('Cargando datos de tu finca...');
  setSyncState('syncing','Cargando...');
  firestore.collection('usuarios').doc(uid).get()
    .then(function(doc) {
      if (doc.exists) {
        db = normalizarDB(doc.data());
        localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));
      } else {
        db = crearDBVacia();
        localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));
        return firestore.collection('usuarios').doc(uid).set(db);
      }
    })
    .then(function(){ setSyncState('ok','Sincronizado'); mostrarApp(usuarioActual); })
    .catch(function(e){
      console.error(e);
      setSyncState('error','Error de conexión');
      const cache = localStorage.getItem(DB_CACHE_KEY);
      try { db = normalizarDB(JSON.parse(cache)); } catch(x){ db = crearDBVacia(); }
      mostrarApp(usuarioActual);
    });
}

function guardarDB() {
  localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));
  const uid = usuarioActual ? usuarioActual.uid : (sesionTrabajador ? sesionTrabajador.uidDueño : null);
  if (!uid) return;
  setSyncState('syncing','Guardando...');
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(function(){
    firestore.collection('usuarios').doc(uid).set(db)
      .then(function(){ setSyncState('ok','Sincronizado ✓'); setTimeout(function(){ setSyncState('ok','Sincronizado'); },2000); })
      .catch(function(e){ console.error(e); setSyncState('error','Error al guardar'); });
  }, 800);
}

function setSyncState(estado, texto) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-texto');
  if (!dot||!txt) return;
  dot.className = 'sync-dot'+(estado==='syncing'?' syncing':estado==='error'?' error':'');
  txt.textContent = texto;
}

// ============================================================
// NAVEGACIÓN
// ============================================================
function mostrarPagina(nombre) {
  window.scrollTo(0,0);
  cerrarSidebar();
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  const pg = document.getElementById('page-'+nombre);
  if (pg) pg.classList.add('active');
  document.getElementById('topbar-titulo').textContent = TITULOS_MOD[nombre] || nombre;
  document.querySelectorAll('.nav-item').forEach(function(n){
    if ((n.getAttribute('onclick')||'').indexOf(nombre)!==-1) n.classList.add('active');
  });
  const fn = {
    dashboard:    renderDashboard,
    animales:     renderTablaAnimales,
    leche:        renderLeche,
    carne:        renderCarne,
    reproduccion: renderReproduccion,
    salud:        renderSalud,
    alimentacion: renderAlimentacion,
    potreros:     renderPotreros,
    finanzas:     renderFinanzas,
    inventario:   renderInventario,
  };
  if (fn[nombre]) fn[nombre]();
}

function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ov  = document.getElementById('sidebar-overlay');
  const btn = document.getElementById('menu-toggle');
  const isOpen = sb.classList.toggle('open');
  ov.classList.toggle('active', isOpen);
  btn.textContent = isOpen ? '✕' : '☰';
}

function cerrarSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
  document.getElementById('menu-toggle').textContent = '☰';
}

// ============================================================
// UTILIDADES
// ============================================================
function fmt(f){ if(!f) return '-'; const[y,m,d]=f.split('-'); return d+'/'+m+'/'+y; }

function edad(nac) {
  if (!nac) return '-';
  const meses = (new Date()-new Date(nac))/2629800000;
  return meses<24 ? Math.floor(meses)+' meses' : Math.floor(meses/12)+' años';
}

function diasPara(f){ if(!f) return null; return Math.ceil((new Date(f)-new Date())/86400000); }

function moneda(v){ const n=Math.round(Number(v)); return '$'+n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }

function nuevoId(p){ return p+'-'+Math.random().toString(36).substring(2,6).toUpperCase(); }

function deduplicar(arr){ return arr.filter(function(v,i,a){ return a.indexOf(v)===i; }); }

function badgeEstado(e){
  const c={activo:'badge-verde',vendido:'badge-azul',muerto:'badge-rojo'};
  return '<span class="badge '+(c[e]||'badge-gris')+'">'+e+'</span>';
}

function hoyISO(){ return new Date().toISOString().split('T')[0]; }

function tieneModulo(mod) {
  const p = PERFILES[perfilActual] || PERFILES.completo;
  return p.modulos.indexOf(mod) !== -1;
}

// Mostrar un mensaje breve no bloqueante (toast)
function showToast(msg, tipo) {
  try {
    let cont = document.getElementById('app-toast-container');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'app-toast-container';
      cont.style.position = 'fixed';
      cont.style.right = '16px';
      cont.style.bottom = '16px';
      cont.style.zIndex = 99999;
      document.body.appendChild(cont);
    }
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.background = tipo==='error'? 'rgba(192,57,43,0.95)' : 'rgba(45,106,79,0.95)';
    el.style.color = '#fff';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '10px';
    el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
    el.style.marginTop = '8px';
    el.style.fontFamily = 'Nunito, sans-serif';
    el.style.fontSize = '0.95rem';
    cont.appendChild(el);
    setTimeout(function(){ el.style.transition = 'opacity 0.4s, transform 0.4s'; el.style.opacity = 0; el.style.transform = 'translateY(8px)'; }, 1800);
    setTimeout(function(){ try{ el.remove(); }catch(e){} }, 2300);
  } catch(e){ console.log('toast', e); }
}

// ============================================================
// MODALES
// ============================================================
function abrirModal(id) {
  document.getElementById(id).classList.add('open');
  if (id==='modal-animal' && idAnimalEnEdicion===null) resetFormularioAnimal();
  if (id==='modal-leche')   llenarSelectVacas();
  if (id==='modal-repro')   llenarSelectHembras();
  if (id==='modal-salud')   llenarSelectAnimales();
  if (id==='modal-pesaje')  llenarSelectAnimalesCarne();
  ['l-fecha','r-fecha','s-fecha','al-fecha','g-fecha','v-fecha','p-fecha'].forEach(function(fid){
    const el=document.getElementById(fid); if(el&&!el.value) el.value=hoyISO();
  });
  if (id==='modal-config'){
    document.getElementById('config-nombre').value      = db.config.nombre;
    document.getElementById('config-propietario').value = db.config.propietario;
    document.getElementById('config-lugar').value       = db.config.lugar;
  }
}

function cerrarModal(id){ document.getElementById(id).classList.remove('open'); }

// ============================================================
// SELECTS DINÁMICOS
// ============================================================
function llenarSelectVacas() {
  const sel = document.getElementById('l-vaca');
  sel.innerHTML = '<option value="">Seleccionar vaca...</option>';
  db.animales.filter(function(a){ return a.tipo==='bovino'&&a.sexo==='hembra'&&a.estado==='activo'; })
    .forEach(function(v){ sel.innerHTML += '<option value="'+v.id+'">'+v.nombre+' ('+v.id+')</option>'; });
}

function llenarSelectHembras() {
  const sel = document.getElementById('r-animal');
  sel.innerHTML = '<option value="">Seleccionar hembra...</option>';
  db.animales.filter(function(a){ return a.sexo==='hembra'&&a.estado==='activo'; })
    .forEach(function(a){ sel.innerHTML += '<option value="'+a.id+'">'+(a.tipo==='bovino'?'🐄':'🐎')+' '+a.nombre+'</option>'; });
}

function llenarSelectAnimales() {
  const sel = document.getElementById('s-animal');
  sel.innerHTML = '<option value="">Seleccionar animal...</option>';
  db.animales.filter(function(a){ return a.estado==='activo'; })
    .forEach(function(a){ sel.innerHTML += '<option value="'+a.id+'">'+(a.tipo==='bovino'?'🐄':'🐎')+' '+a.nombre+'</option>'; });
}

function llenarSelectAnimalesCarne() {
  const sel = document.getElementById('p-animal');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccionar animal...</option>';
  db.animales.filter(function(a){ return a.tipo==='bovino'&&a.estado==='activo'; })
    .forEach(function(a){ sel.innerHTML += '<option value="'+a.id+'">🐄 '+a.nombre+' ('+a.id+')</option>'; });
}

// ============================================================
// GUARDAR — CONFIGURACIÓN
// ============================================================
function guardarConfig() {
  db.config.nombre      = document.getElementById('config-nombre').value      || 'Mi Finca';
  db.config.propietario = document.getElementById('config-propietario').value  || 'Administrador';
  db.config.lugar       = document.getElementById('config-lugar').value;

  // Cambio de perfil desde configuración
  const nuevoPerfil = document.getElementById('config-perfil');
  if (nuevoPerfil && nuevoPerfil.value) {
    db.config.perfil = nuevoPerfil.value;
    perfilActual     = nuevoPerfil.value;
    construirNavegacion();
  }

  guardarDB();
  document.getElementById('sidebar-titulo-finca').textContent = '🌿 '+db.config.nombre;
  document.getElementById('nombre-usuario').textContent       = db.config.propietario;
  document.getElementById('avatar-inicial').textContent       = db.config.propietario[0].toUpperCase();
  cerrarModal('modal-config');
  alert('✅ Configuración guardada y sincronizada');
}

// ============================================================
// GUARDAR — ANIMALES
// ============================================================
function resetFormularioAnimal() {
  idAnimalEnEdicion = null;
  ['a-nombre','a-raza','a-nacimiento','a-peso','a-madre','a-padre','a-notas',
   'a-kg-compra','a-precio-compra'].forEach(function(id){
    const el = document.getElementById(id); if(el) el.value='';
  });
  const tipo = document.getElementById('a-tipo');
  if (tipo) tipo.value='bovino';
  ['a-sexo','a-procedencia','a-estado'].forEach(function(id){
    const el=document.getElementById(id);
    if(el) el.value = id==='a-sexo'?'hembra':id==='a-procedencia'?'nacido':'activo';
  });
  actualizarCamposCarne();
}

function actualizarCamposCarne() {
  const tipo  = document.getElementById('a-tipo');
  const fCarne= document.getElementById('campos-carne');
  if (!tipo||!fCarne) return;
  fCarne.style.display = (tipo.value==='bovino' && tieneModulo('carne')) ? 'contents' : 'none';
}

function guardarAnimal() {
  const nombre = document.getElementById('a-nombre').value.trim();
  const nac    = document.getElementById('a-nacimiento').value;
  const peso   = document.getElementById('a-peso').value;
  if (!nombre||!nac||!peso){ showToast('⚠️ Completa los campos obligatorios', 'error'); return; }
  const tipo  = document.getElementById('a-tipo').value;
  const kgC   = document.getElementById('a-kg-compra');
  const prC   = document.getElementById('a-precio-compra');
  const animal = {
    id:            idAnimalEnEdicion || nuevoId(tipo==='bovino'?'BOV':'EQU'),
    tipo,
    nombre,
    sexo:          document.getElementById('a-sexo').value,
    raza:          document.getElementById('a-raza').value,
    nacimiento:    nac,
    peso:          Number(peso),
    estado:        document.getElementById('a-estado').value,
    procedencia:   document.getElementById('a-procedencia').value,
    madre:         document.getElementById('a-madre').value,
    padre:         document.getElementById('a-padre').value,
    notas:         document.getElementById('a-notas').value,
    // campos de carne
    kgCompra:      kgC  ? Number(kgC.value)||0  : 0,
    precioCompra:  prC  ? Number(prC.value)||0  : 0,
    fechaCompra:   nac,   // por defecto la fecha de nacimiento/ingreso
  };
  if (idAnimalEnEdicion) {
    const i = db.animales.findIndex(function(a){ return a.id===idAnimalEnEdicion; });
    if (i!==-1) db.animales[i]=animal;
    showToast('✅ Animal "'+nombre+'" actualizado');
  } else {
    db.animales.push(animal);
    showToast('✅ Animal "'+nombre+'" guardado · ID: '+animal.id);
  }
  guardarDB();
  cerrarModal('modal-animal');
  renderTablaAnimales();
  resetFormularioAnimal();
}

function editarAnimal(id) {
  const a = db.animales.find(function(x){ return x.id===id; });
  if (!a) return;
  const set = function(eid, val){ const el=document.getElementById(eid); if(el) el.value=val||''; };
  set('a-tipo', a.tipo); set('a-nombre',a.nombre); set('a-sexo',a.sexo);
  set('a-raza',a.raza); set('a-nacimiento',a.nacimiento); set('a-peso',a.peso);
  set('a-procedencia',a.procedencia); set('a-estado',a.estado);
  set('a-madre',a.madre); set('a-padre',a.padre); set('a-notas',a.notas);
  set('a-kg-compra', a.kgCompra); set('a-precio-compra', a.precioCompra);
  idAnimalEnEdicion = id;
  actualizarCamposCarne();
  abrirModal('modal-animal');
}

function eliminarAnimal(id) {
  if (!confirm('¿Eliminar este animal?')) return;
  db.animales     = db.animales.filter(function(a){ return a.id!==id; });
  db.leche        = db.leche.filter(function(r){ return r.animalId!==id; });
  db.reproductivo = db.reproductivo.filter(function(r){ return r.animalId!==id; });
  db.salud        = db.salud.filter(function(r){ return r.animalId!==id; });
  db.pesajes      = db.pesajes.filter(function(r){ return r.animalId!==id; });
  guardarDB();
  renderTablaAnimales(); renderDashboard(); renderInventario();
}

function eliminarCompleto(id) {
  const animal = db.animales.find(function(a){ return a.id===id; });
  if (!animal) return;
  if (!confirm('⚠️ Eliminar "'+animal.nombre+'" y TODOS sus registros. ¿Continuar?')) return;
  db.animales     = db.animales.filter(function(a){ return a.id!==id; });
  db.leche        = db.leche.filter(function(r){ return r.animalId!==id; });
  db.reproductivo = db.reproductivo.filter(function(r){ return r.animalId!==id; });
  db.salud        = db.salud.filter(function(r){ return r.animalId!==id; });
  db.pesajes      = db.pesajes.filter(function(r){ return r.animalId!==id; });
  guardarDB();
  renderTablaAnimales(); renderDashboard(); renderLeche(); renderReproduccion(); renderSalud(); renderInventario();
}

// ============================================================
// GUARDAR — MÓDULOS BÁSICOS
// ============================================================
function guardarLeche() {
  const animalId=document.getElementById('l-vaca').value;
  const fecha=document.getElementById('l-fecha').value;
  const litros=document.getElementById('l-litros').value;
  if (!animalId||!fecha||!litros){ showToast('⚠️ Completa todos los campos', 'error'); return; }
  db.leche.push({ id:nuevoId('L'), animalId, fecha, litros:Number(litros), nota:document.getElementById('l-nota').value });
  guardarDB(); cerrarModal('modal-leche'); renderLeche();
  document.getElementById('l-litros').value=''; document.getElementById('l-nota').value='';
  showToast('✅ Producción registrada');
}

function calcularFechaParto(fecha,tipo) {
  if (!fecha||!tipo) return null;
  const d=new Date(fecha); d.setDate(d.getDate()+(tipo==='bovino'?283:340));
  return d.toISOString().split('T')[0];
}

function cambiarGestante(id,valor) {
  const r=db.reproductivo.find(function(x){ return x.id===id; });
  if (!r) return;
  r.gestante=valor;
  const a=db.animales.find(function(x){ return x.id===r.animalId; });
  r.fechaParto=valor==='si'?calcularFechaParto(r.fecha,a&&a.tipo):null;
  guardarDB(); renderReproduccion();
}

function guardarRepro() {
  const animalId=document.getElementById('r-animal').value;
  const fecha=document.getElementById('r-fecha').value;
  if (!animalId||!fecha){ alert('⚠️ Selecciona animal y fecha'); return; }
  const a=db.animales.find(function(x){ return x.id===animalId; });
  const gestante=document.getElementById('r-gestante').value;
  const fechaParto=gestante==='si'?calcularFechaParto(fecha,a&&a.tipo):null;
  db.reproductivo.push({ id:nuevoId('R'), animalId,
    tipo:document.getElementById('r-tipo').value, fecha,
    macho:document.getElementById('r-macho').value,
    gestante, fechaParto, obs:document.getElementById('r-obs').value });
  guardarDB(); cerrarModal('modal-repro'); renderReproduccion();
  if (fechaParto) showToast('✅ Parto estimado: '+fmt(fechaParto));
}

function guardarSalud() {
  const animalId=document.getElementById('s-animal').value;
  const fecha=document.getElementById('s-fecha').value;
  if (!animalId||!fecha){ showToast('⚠️ Selecciona animal y fecha', 'error'); return; }
  db.salud.push({ id:nuevoId('S'), animalId,
    tipo:document.getElementById('s-tipo').value,
    desc:document.getElementById('s-desc').value,
    medicamento:document.getElementById('s-medicamento').value,
    dosis:document.getElementById('s-dosis').value,
    costo:Number(document.getElementById('s-costo').value)||0,
    fecha, proxima:document.getElementById('s-proxima').value,
    veterinario:document.getElementById('s-vet').value });
  guardarDB(); cerrarModal('modal-salud'); renderSalud();
  ['s-desc','s-medicamento','s-dosis','s-proxima','s-vet','s-costo'].forEach(function(id){
    const el=document.getElementById(id); if(el) el.value='';
  });
  showToast('✅ Evento médico guardado');
}

function guardarAlimento() {
  const cantidad=document.getElementById('al-cantidad').value;
  const kg=document.getElementById('al-kg').value;
  if (!cantidad||!kg){ showToast('⚠️ Completa cantidad y kg', 'error'); return; }
  db.alimentacion.push({ id:nuevoId('A'),
    tipo:document.getElementById('al-tipo').value,
    fecha:document.getElementById('al-fecha').value,
    cantidad:Number(cantidad), kg:Number(kg),
    consumoDiario:Number(document.getElementById('al-consumo').value)||0,
    costo:Number(document.getElementById('al-costo').value)||0,
    notas:document.getElementById('al-notas').value });
  guardarDB(); cerrarModal('modal-alimento'); renderAlimentacion();
  showToast('✅ Alimento registrado');
}

function guardarGasto() {
  const valor=document.getElementById('g-valor').value;
  const desc=document.getElementById('g-desc').value.trim();
  if (!valor||!desc){ showToast('⚠️ Completa valor y descripción', 'error'); return; }
  db.finanzas.push({ id:nuevoId('F'), fecha:document.getElementById('g-fecha').value,
    tipo:'gasto', cat:document.getElementById('g-cat').value,
    desc, valor:Number(valor), extra:document.getElementById('g-prov').value });
  guardarDB(); cerrarModal('modal-gasto'); renderFinanzas();
  ['g-valor','g-desc','g-prov'].forEach(function(id){ document.getElementById(id).value=''; });
  showToast('✅ Gasto registrado');
}

function guardarVenta() {
  const valor=document.getElementById('v-valor').value;
  const desc=document.getElementById('v-desc').value.trim();
  if (!valor||!desc){ showToast('⚠️ Completa valor y descripción', 'error'); return; }
  db.finanzas.push({ id:nuevoId('F'), fecha:document.getElementById('v-fecha').value,
    tipo:'ingreso', cat:document.getElementById('v-tipo').value,
    desc, valor:Number(valor), extra:document.getElementById('v-cliente').value });
  guardarDB(); cerrarModal('modal-venta'); renderFinanzas();
  ['v-valor','v-desc','v-cliente'].forEach(function(id){ document.getElementById(id).value=''; });
  showToast('✅ Ingreso registrado');
}

// ============================================================
// GUARDAR — PESAJE (módulo de carne)
// ============================================================
function guardarPesaje() {
  const animalId = document.getElementById('p-animal').value;
  const fecha    = document.getElementById('p-fecha').value;
  const kg       = document.getElementById('p-kg').value;
  if (!animalId||!fecha||!kg){ showToast('⚠️ Completa todos los campos', 'error'); return; }
  const tipo = document.getElementById('p-tipo').value;   // entrada | control | salida
  const costo= Number(document.getElementById('p-costo').value)||0;
  const pesaje = {
    id: nuevoId('P'), animalId, fecha,
    kg: Number(kg), tipo, costo,
    notas: document.getElementById('p-notas').value
  };
  db.pesajes.push(pesaje);

  // Si es una salida (venta), actualizar estado del animal y registrar ingreso
  if (tipo === 'salida') {
    const a = db.animales.find(function(x){ return x.id===animalId; });
    if (a) {
      a.estado   = 'vendido';
      a.kgVenta  = Number(kg);
      a.precioVenta = costo;
      a.fechaVenta  = fecha;
    }
    if (costo>0) {
      db.finanzas.push({ id:nuevoId('F'), fecha,
        tipo:'ingreso', cat:'venta_animal',
        desc:'Venta '+(a?a.nombre:animalId)+' — '+kg+' kg',
        valor:costo, extra:'' });
    }
  }
  // Si es una entrada, registrar gasto de compra
  if (tipo === 'entrada') {
    const a = db.animales.find(function(x){ return x.id===animalId; });
    if (a) { a.kgCompra=Number(kg); a.precioCompra=costo; a.fechaCompra=fecha; }
    if (costo>0) {
      db.finanzas.push({ id:nuevoId('F'), fecha,
        tipo:'gasto', cat:'compra_animal',
        desc:'Compra '+(a?a.nombre:animalId)+' — '+kg+' kg',
        valor:costo, extra:'' });
    }
  }

  guardarDB(); cerrarModal('modal-pesaje'); renderCarne();
  ['p-kg','p-costo','p-notas'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });
  showToast('✅ Pesaje registrado');
}

// ============================================================
// CÁLCULO RENTABILIDAD POR ANIMAL (carne)
// ============================================================
function calcularRentabilidadAnimal(animalId) {
  const a = db.animales.find(function(x){ return x.id===animalId; });
  if (!a) return null;

  const pesajesA   = db.pesajes.filter(function(p){ return p.animalId===animalId; }).sort(function(x,y){ return x.fecha<y.fecha?-1:1; });
  const saludA     = db.salud.filter(function(s){ return s.animalId===animalId; });
  const alimentosA = db.alimentacion; // alimentación compartida

  const entrada = pesajesA.find(function(p){ return p.tipo==='entrada'; }) ||
                  (a.kgCompra ? { kg:a.kgCompra, costo:a.precioCompra, fecha:a.fechaCompra } : null);
  const salida  = pesajesA.find(function(p){ return p.tipo==='salida'; }) ||
                  (a.kgVenta  ? { kg:a.kgVenta,  costo:a.precioVenta,  fecha:a.fechaVenta  } : null);

  const kgEntrada   = entrada ? entrada.kg    : a.kgCompra || 0;
  const costoCompra = entrada ? entrada.costo : a.precioCompra || 0;
  const kgSalida    = salida  ? salida.kg     : (a.estado==='vendido' ? a.kgVenta||0 : 0);
  const precioVenta = salida  ? salida.costo  : (a.estado==='vendido' ? a.precioVenta||0 : 0);

  // Peso actual = último pesaje o peso registrado
  const ultPesaje = pesajesA.filter(function(p){ return p.tipo==='control'||p.tipo==='salida'; }).slice(-1)[0];
  const pesoActual= ultPesaje ? ultPesaje.kg : a.peso || 0;

  const gananciaKg = (kgSalida||pesoActual) - kgEntrada;

  // Costos de vacunas/salud
  const costoVacunas = saludA.reduce(function(s,x){ return s+(x.costo||0); },0);

  // Días en la finca
  const fechaIni = entrada ? new Date(entrada.fecha) : new Date(a.nacimiento||a.fechaCompra||hoyISO());
  const fechaFin = salida  ? new Date(salida.fecha)  : new Date();
  const dias     = Math.max(1, Math.ceil((fechaFin-fechaIni)/86400000));
  const meses    = (dias/30.44).toFixed(1);

  // Ganancia neta
  const gananciaMonetaria = precioVenta - costoCompra - costoVacunas;
  const roi = costoCompra>0 ? ((gananciaMonetaria/costoCompra)*100).toFixed(1) : null;

  return {
    animal: a, kgEntrada, kgSalida: kgSalida||pesoActual, pesoActual,
    gananciaKg, costoCompra, precioVenta, costoVacunas,
    gananciaMonetaria, roi, dias, meses,
    vendido: a.estado==='vendido',
    pesajesHistorial: pesajesA
  };
}

// ============================================================
// RENDER — DASHBOARD
// ============================================================
function renderDashboard() {
  try {
    const hoy   = new Date();
    const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fHoy  = document.getElementById('fecha-hoy');
    if (fHoy) fHoy.textContent = dias[hoy.getDay()]+', '+hoy.getDate()+' de '+meses[hoy.getMonth()]+' de '+hoy.getFullYear();

    const sidebarTitulo = document.getElementById('sidebar-titulo-finca');
    if (sidebarTitulo) sidebarTitulo.textContent = '🌿 '+(db.config.nombre||'Mi Finca');
    const nomU = document.getElementById('nombre-usuario');
    if (nomU) nomU.textContent = db.config.propietario||'Administrador';
    const avt = document.getElementById('avatar-inicial');
    if (avt) avt.textContent = (db.config.propietario||'A')[0].toUpperCase();

    const activos   = db.animales.filter(function(a){ return a.estado==='activo'; });
    const bovinos   = activos.filter(function(a){ return a.tipo==='bovino'; });
    const equinos   = activos.filter(function(a){ return a.tipo==='equino'; });
    const gestantes = db.reproductivo.filter(function(r){ return r.gestante==='si'; }).length;
    const ultFechas = deduplicar(db.leche.map(function(l){ return l.fecha; })).sort().reverse();
    const lechHoy   = ultFechas[0]?db.leche.filter(function(l){ return l.fecha===ultFechas[0]; }).reduce(function(s,l){ return s+l.litros; },0):0;

    // Stats de carne
    let gananciaTotal = 0;
    db.animales.filter(function(a){ return a.estado==='vendido'&&a.tipo==='bovino'; }).forEach(function(a){
      const r = calcularRentabilidadAnimal(a.id);
      if (r) gananciaTotal += r.gananciaMonetaria;
    });

    const statsEl = document.getElementById('stats-dashboard');
    if (statsEl) {
      let cards = '';
      if (tieneModulo('animales')) {
        cards += '<div class="stat-card"><div class="stat-label">Bovinos activos<span>🐄</span></div><div class="stat-value" style="color:var(--verde-medio)">'+bovinos.length+'</div><div class="stat-sub">en inventario</div></div>';
        if (equinos.length>0||tieneModulo('equino'))
          cards += '<div class="stat-card"><div class="stat-label">Equinos activos<span>🐎</span></div><div class="stat-value" style="color:var(--tierra)">'+equinos.length+'</div><div class="stat-sub">en inventario</div></div>';
      }
      if (tieneModulo('reproduccion'))
        cards += '<div class="stat-card"><div class="stat-label">Gestantes<span>🤰</span></div><div class="stat-value" style="color:var(--azul)">'+gestantes+'</div></div>';
      if (tieneModulo('leche'))
        cards += '<div class="stat-card"><div class="stat-label">Leche último reg.<span>🥛</span></div><div class="stat-value" style="color:var(--verde-claro)">'+lechHoy.toFixed(1)+'</div><div class="stat-sub">litros</div></div>';
      if (tieneModulo('carne'))
        cards += '<div class="stat-card"><div class="stat-label">Ganancia en ventas<span>🥩</span></div><div class="stat-value" style="color:'+(gananciaTotal>=0?'var(--verde-medio)':'var(--rojo)')+'">'+moneda(gananciaTotal)+'</div><div class="stat-sub">total histórico</div></div>';
      statsEl.innerHTML = cards;
    }

    const alertas = calcularAlertas();
    const panelAl = document.getElementById('alertas-panel');
    if (panelAl) {
      if (alertas.length===0) {
        panelAl.innerHTML='<p style="color:var(--gris-texto);font-size:0.85rem">✅ Sin alertas pendientes</p>';
      } else {
        panelAl.innerHTML=alertas.slice(0,4).map(function(a){
          return '<div class="alerta-item '+(a.urgente?'alerta-roja':'alerta-amarilla')+'">' +
            '<div><strong style="font-size:0.83rem">'+a.animal+' — '+a.tipo+'</strong>' +
            '<p style="font-size:0.77rem;color:var(--gris-texto)">'+a.desc+'</p></div>' +
            '<span class="badge '+(a.urgente?'badge-rojo':'badge-amarillo')+'">'+(a.dias<0?'Vencida':'En '+a.dias+'d')+'</span></div>';
        }).join('');
      }
    }

    const btnAl = document.getElementById('btn-alerta');
    if (btnAl) {
      btnAl.style.display = alertas.length>0?'block':'none';
      if (alertas.length>0) document.getElementById('alerta-count').textContent=alertas.length;
    }

    const navSalud = document.getElementById('nav-salud');
    if (navSalud) {
      const badge = navSalud.querySelector('.nav-badge');
      if (alertas.length>0) {
        if (!badge) navSalud.insertAdjacentHTML('beforeend','<span class="nav-badge">'+alertas.length+'</span>');
        else badge.textContent=alertas.length;
      } else if (badge) badge.remove();
    }

    const partoPanel = document.getElementById('partos-panel');
    if (partoPanel && tieneModulo('reproduccion')) {
      const partosPrx = db.reproductivo.filter(function(r){
        return r.gestante==='si'&&r.fechaParto&&
          (function(a){ return a&&a.estado==='activo'; })(db.animales.find(function(x){ return x.id===r.animalId; }));
      }).sort(function(a,b){ return new Date(a.fechaParto)-new Date(b.fechaParto); });
      if (partosPrx.length===0) {
        partoPanel.innerHTML='<p style="color:var(--gris-texto);font-size:0.85rem">Sin gestaciones activas</p>';
      } else {
        partoPanel.innerHTML=partosPrx.map(function(r){
          const a=db.animales.find(function(x){ return x.id===r.animalId; });
          const d=diasPara(r.fechaParto);
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gris-borde);font-size:0.83rem">'+
            '<div><strong>'+((a&&a.nombre)||r.animalId)+'</strong><p style="color:var(--gris-texto);font-size:0.77rem">Parto est.: '+fmt(r.fechaParto)+'</p></div>'+
            '<span class="badge '+(d<=30?'badge-amarillo':'badge-azul')+'">'+(d>0?d+'d':'¡Inminente!')+'</span></div>';
        }).join('');
      }
    } else if (partoPanel) {
      partoPanel.innerHTML='<p style="color:var(--gris-texto);font-size:0.85rem">Módulo no activo</p>';
    }

    if (tieneModulo('leche')) renderGraficoLeche();
    else {
      const gr = document.getElementById('grafico-leche');
      if (gr) gr.innerHTML='<p style="color:var(--gris-texto);font-size:0.85rem">Módulo de leche no activo en este perfil.</p>';
    }
  } catch(e){ console.error('renderDashboard:',e); }
}

function renderGraficoLeche() {
  const fechas  = deduplicar(db.leche.map(function(l){ return l.fecha; })).sort().reverse().slice(0,7).reverse();
  const grafico = document.getElementById('grafico-leche');
  if (!grafico) return;
  if (fechas.length===0){ grafico.innerHTML='<p style="color:var(--gris-texto);font-size:0.85rem">Sin registros de leche.</p>'; return; }
  const totales = fechas.map(function(f){ return { fecha:f, total:db.leche.filter(function(l){ return l.fecha===f; }).reduce(function(s,l){ return s+l.litros; },0) }; });
  const maximo  = totales.reduce(function(m,t){ return Math.max(m,t.total); },1);
  grafico.innerHTML = totales.map(function(t){
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">'+
      '<span style="font-size:0.68rem;color:var(--gris-texto)">'+t.total.toFixed(0)+'L</span>'+
      '<div style="width:100%;background:var(--verde-claro);border-radius:4px 4px 0 0;height:'+Math.round((t.total/maximo)*80)+'px;min-height:4px"></div>'+
      '<span style="font-size:0.65rem;color:var(--gris-texto)">'+t.fecha.slice(5)+'</span></div>';
  }).join('');
}

function calcularAlertas() {
  const activos = db.animales.filter(function(a){ return a.estado==='activo'; }).map(function(a){ return a.id; });
  return db.salud
    .filter(function(s){ return activos.indexOf(s.animalId)!==-1&&diasPara(s.proxima)!==null&&diasPara(s.proxima)<=60; })
    .map(function(s){
      const a=db.animales.find(function(x){ return x.id===s.animalId; });
      const d=diasPara(s.proxima);
      return { animal:(a&&a.nombre)||s.animalId, tipo:s.tipo, desc:s.desc, dias:d, urgente:d<=7||d<0 };
    })
    .sort(function(a,b){ return a.dias-b.dias; });
}

// ============================================================
// RENDER — ANIMALES
// ============================================================
function renderTablaAnimales() {
  const busca   = (document.getElementById('buscar-animal').value||'').toLowerCase();
  const filtTip = document.getElementById('filtro-tipo').value||'';
  const filtEst = document.getElementById('filtro-estado').value||'';
  const filtrados = db.animales.filter(function(a){
    if (filtTip&&a.tipo!==filtTip)   return false;
    if (filtEst&&a.estado!==filtEst) return false;
    if (busca&&!a.nombre.toLowerCase().includes(busca)&&!a.id.toLowerCase().includes(busca)) return false;
    return true;
  });
  document.getElementById('conteo-animales').textContent = filtrados.length+' resultados';
  document.getElementById('tbody-animales').innerHTML = filtrados.map(function(a){
    const mostraCarne = tieneModulo('carne')&&a.tipo==='bovino';
    const r = mostraCarne ? calcularRentabilidadAnimal(a.id) : null;
    return '<tr onclick="verFicha(\''+a.id+'\')">'+
      '<td><code style="font-size:0.78rem;color:var(--verde-medio)">'+a.id+'</code></td>'+
      '<td>'+(a.tipo==='bovino'?'🐄':'🐎')+' '+a.tipo+'</td>'+
      '<td><strong>'+a.nombre+'</strong></td>'+
      '<td><span class="badge '+(a.sexo==='hembra'?'badge-tierra':'badge-azul')+'">'+a.sexo+'</span></td>'+
      '<td>'+(a.raza||'-')+'</td><td>'+edad(a.nacimiento)+'</td>'+
      '<td>'+(r?r.pesoActual:a.peso)+' kg</td>'+
      (mostraCarne?'<td style="font-size:0.78rem">'+(r&&r.kgEntrada?r.kgEntrada+' kg entrada<br>'+moneda(r.costoCompra):'—')+'</td>':'')+ 
      '<td>'+badgeEstado(a.estado)+'</td>'+
      '<td style="display:flex;gap:6px">'+
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();editarAnimal(\''+a.id+'\')">✏️</button>'+
        '<button class="btn btn-sm btn-rojo"    onclick="event.stopPropagation();eliminarAnimal(\''+a.id+'\')">🗑️</button>'+
        (a.estado==='muerto'||a.estado==='vendido'?'<button class="btn btn-sm" style="background:#7c5c3c;color:#fff" onclick="event.stopPropagation();eliminarCompleto(\''+a.id+'\')">🗑️✕</button>':'')+ 
      '</td></tr>';
  }).join('')||'<tr><td colspan="10" style="text-align:center;color:var(--gris-texto);padding:1.5rem">Sin animales</td></tr>';
}

function verFicha(id) {
  const a=db.animales.find(function(x){ return x.id===id; });
  if (!a) return;
  const saludA = db.salud.filter(function(s){ return s.animalId===id; });
  const reproA = db.reproductivo.filter(function(r){ return r.animalId===id; });
  const lecheA = db.leche.filter(function(l){ return l.animalId===id; });
  const pesajesA=db.pesajes.filter(function(p){ return p.animalId===id; }).sort(function(x,y){ return x.fecha<y.fecha?-1:1; });
  const tipoIcon={vacuna:'💉',desparasitacion:'🪱',herraje:'🔩',odontologia:'🦷',vitamina:'💊',otro:'🏥'};
  const totalL=lecheA.reduce(function(s,l){ return s+l.litros; },0);
  const promL =lecheA.length>0?(totalL/lecheA.length).toFixed(1):'-';

  const madre=a.madre?db.animales.find(function(x){ return x.id===a.madre; }):null;
  const padre=a.padre?db.animales.find(function(x){ return x.id===a.padre; }):null;
  const genealogia=(madre||padre)?
    '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🌳 GENEALOGÍA</p>'+
    '<div style="display:flex;gap:12px;flex-wrap:wrap">'+
    (madre?'<div class="gen-box">🐄 Madre<br><small>'+madre.nombre+'</small></div>':'')+
    (padre?'<div class="gen-box" style="background:var(--azul-pastel);color:var(--azul)">🐂 Padre<br><small>'+padre.nombre+'</small></div>':'')+
    '<div class="gen-box" style="background:var(--tierra-pastel);color:var(--tierra)">⬤ '+a.nombre+'</div></div></div>':'';

  // Bloque de carne
  let bloqueCarneHTML = '';
  if (a.tipo==='bovino'&&tieneModulo('carne')) {
    const r = calcularRentabilidadAnimal(id);
    if (r) {
      const colorGan = r.gananciaMonetaria>=0?'var(--verde-medio)':'var(--rojo)';
      bloqueCarneHTML =
        '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🥩 RENTABILIDAD DE CARNE</p>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'+
          '<div class="stat-card"><div class="stat-label">Peso entrada</div><div class="stat-value" style="font-size:1rem">'+(r.kgEntrada||'-')+' kg</div></div>'+
          '<div class="stat-card"><div class="stat-label">'+(r.vendido?'Peso venta':'Peso actual')+'</div><div class="stat-value" style="font-size:1rem">'+r.kgSalida+' kg</div></div>'+
          '<div class="stat-card"><div class="stat-label">Ganancia kg</div><div class="stat-value" style="font-size:1rem;color:'+(r.gananciaKg>=0?'var(--verde-medio)':'var(--rojo)')+'">'+
            (r.gananciaKg>=0?'+':'')+r.gananciaKg.toFixed(1)+' kg</div></div>'+
          '<div class="stat-card"><div class="stat-label">Costo compra</div><div class="stat-value" style="font-size:1rem">'+moneda(r.costoCompra)+'</div></div>'+
          '<div class="stat-card"><div class="stat-label">Costo vacunas</div><div class="stat-value" style="font-size:1rem;color:var(--rojo)">'+moneda(r.costoVacunas)+'</div></div>'+
          '<div class="stat-card"><div class="stat-label">Ganancia neta</div><div class="stat-value" style="font-size:1rem;color:'+colorGan+'">'+moneda(r.gananciaMonetaria)+'</div>'+
            (r.roi?'<div class="stat-sub">ROI: '+r.roi+'%</div>':'')+'</div>'+
          '<div class="stat-card" style="grid-column:1/-1"><div class="stat-label">Tiempo en finca</div><div class="stat-value" style="font-size:1rem">'+r.meses+' meses ('+r.dias+' días)</div></div>'+
        '</div>'+
        (pesajesA.length>0?
          '<p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin:10px 0 6px">📋 HISTORIAL DE PESAJES</p>'+
          '<table style="width:100%;font-size:0.8rem;border-collapse:collapse"><thead><tr>'+
          '<th style="padding:5px;border-bottom:2px solid var(--gris-borde);text-align:left">Fecha</th>'+
          '<th style="padding:5px;border-bottom:2px solid var(--gris-borde);text-align:left">Tipo</th>'+
          '<th style="padding:5px;border-bottom:2px solid var(--gris-borde);text-align:left">Kg</th>'+
          '<th style="padding:5px;border-bottom:2px solid var(--gris-borde);text-align:left">Valor</th>'+
          '</tr></thead><tbody>'+
          pesajesA.map(function(p){
            const label={entrada:'🟢 Entrada',control:'📊 Control',salida:'🔴 Venta'}[p.tipo]||p.tipo;
            return '<tr><td style="padding:5px;border-bottom:1px solid var(--gris-borde)">'+fmt(p.fecha)+'</td>'+
              '<td style="padding:5px;border-bottom:1px solid var(--gris-borde)">'+label+'</td>'+
              '<td style="padding:5px;border-bottom:1px solid var(--gris-borde)"><strong>'+p.kg+' kg</strong></td>'+
              '<td style="padding:5px;border-bottom:1px solid var(--gris-borde)">'+(p.costo?moneda(p.costo):'-')+'</td></tr>';
          }).join('')+
          '</tbody></table>':'')+'</div>';
    }
  }

  document.getElementById('ficha-contenido').innerHTML =
    '<div class="ficha-animal">'+
      '<div class="ficha-emoji">'+(a.tipo==='bovino'?'🐄':'🐎')+'</div>'+
      '<div><h2 style="font-size:1.3rem;font-family:\'Playfair Display\',serif;color:var(--verde-oscuro)">'+a.nombre+'</h2>'+
      '<p style="color:var(--gris-texto);font-size:0.82rem">ID: '+a.id+' · '+(a.raza||'Sin raza')+' · '+edad(a.nacimiento)+'</p>'+
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'+badgeEstado(a.estado)+
        '<span class="badge '+(a.sexo==='hembra'?'badge-tierra':'badge-azul')+'">'+a.sexo+'</span>'+
        '<span class="badge badge-gris">'+a.procedencia+'</span></div></div></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:1rem">'+
      '<div class="stat-card"><div class="stat-label">Peso</div><div class="stat-value" style="font-size:1.2rem">'+a.peso+' kg</div></div>'+
      '<div class="stat-card"><div class="stat-label">Nacimiento</div><div class="stat-value" style="font-size:1rem">'+fmt(a.nacimiento)+'</div></div>'+
      '<div class="stat-card"><div class="stat-label">Edad</div><div class="stat-value" style="font-size:1rem">'+edad(a.nacimiento)+'</div></div>'+
    '</div>'+
    (a.notas?'<div class="ayuda" style="margin-bottom:1rem">📝 '+a.notas+'</div>':'')+
    genealogia + bloqueCarneHTML +
    '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">💉 HISTORIAL MÉDICO ('+saludA.length+')</p>'+
    (saludA.length===0?'<p style="font-size:0.82rem;color:var(--gris-texto)">Sin registros.</p>':
      saludA.map(function(s){
        return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.82rem">'+
          '<span>'+(tipoIcon[s.tipo]||'🏥')+' <strong>'+s.tipo+'</strong> — '+(s.desc||'-')+(s.medicamento?' · '+s.medicamento+' '+s.dosis:'')+(s.costo?' · '+moneda(s.costo):'')+'</span>'+
          '<span style="color:var(--gris-texto)">'+fmt(s.fecha)+'</span></div>';
      }).join(''))+
    '</div>'+
    (a.tipo==='bovino'&&a.sexo==='hembra'&&tieneModulo('leche')?
      '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🥛 PRODUCCIÓN</p>'+
      '<p style="font-size:0.85rem">Registros: <strong>'+lecheA.length+'</strong> · Total: <strong>'+totalL.toFixed(1)+' L</strong> · Prom: <strong>'+promL+' L/día</strong></p></div>':'')+
    (reproA.length>0&&tieneModulo('reproduccion')?
      '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🔁 REPRODUCTIVO</p>'+
      reproA.map(function(r){
        return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.82rem">'+
          '<span><strong>'+r.tipo+'</strong>'+(r.macho?' · '+r.macho:'')+(r.gestante==='si'?' <span class="badge badge-azul">gestante</span>':'')+'</span>'+
          '<span style="color:var(--gris-texto)">'+fmt(r.fecha)+(r.fechaParto?' → parto '+fmt(r.fechaParto):'')+'</span></div>';
      }).join('')+'</div>':'');
  abrirModal('modal-ficha');
}

// ============================================================
// RENDER — MÓDULO GANADO DE CARNE
// ============================================================
function renderCarne() {
  const bovinos = db.animales.filter(function(a){ return a.tipo==='bovino'; });
  const activos = bovinos.filter(function(a){ return a.estado==='activo'; });
  const vendidos= bovinos.filter(function(a){ return a.estado==='vendido'; });

  // Calcular totales
  let totalGananciaKg=0, totalGananciaMonetaria=0, totalCostoVacunas=0, totalAnimalesConDatos=0;
  vendidos.forEach(function(a){
    const r=calcularRentabilidadAnimal(a.id);
    if (!r) return;
    totalGananciaKg       += r.gananciaKg;
    totalGananciaMonetaria+= r.gananciaMonetaria;
    totalCostoVacunas     += r.costoVacunas;
    if (r.kgEntrada>0) totalAnimalesConDatos++;
  });
  const promedioGananciaKg = totalAnimalesConDatos>0?(totalGananciaKg/totalAnimalesConDatos).toFixed(1):'-';
  const promedioGanancia   = totalAnimalesConDatos>0?totalGananciaMonetaria/totalAnimalesConDatos:0;

  const statsEl = document.getElementById('stats-carne');
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="stat-card"><div class="stat-label">Bovinos activos<span>🐄</span></div><div class="stat-value" style="color:var(--verde-medio)">'+activos.length+'</div></div>'+
      '<div class="stat-card"><div class="stat-label">Vendidos<span>💰</span></div><div class="stat-value" style="color:var(--azul)">'+vendidos.length+'</div></div>'+
      '<div class="stat-card"><div class="stat-label">Ganancia prom/animal<span>📊</span></div><div class="stat-value" style="font-size:1.1rem;color:'+(promedioGanancia>=0?'var(--verde-medio)':'var(--rojo)')+'">'+moneda(promedioGanancia)+'</div></div>'+
      '<div class="stat-card"><div class="stat-label">Promedio kg ganados<span>⚖️</span></div><div class="stat-value" style="font-size:1.3rem;color:var(--verde-claro)">'+promedioGananciaKg+'</div><div class="stat-sub">kg por animal</div></div>'+
      '<div class="stat-card"><div class="stat-label">Total costos vacunas<span>💉</span></div><div class="stat-value" style="font-size:1.1rem;color:var(--rojo)">'+moneda(totalCostoVacunas)+'</div></div>'+
      '<div class="stat-card"><div class="stat-label">Ganancia total neta<span>💹</span></div><div class="stat-value" style="font-size:1.1rem;color:'+(totalGananciaMonetaria>=0?'var(--verde-medio)':'var(--rojo)')+'">'+moneda(totalGananciaMonetaria)+'</div></div>';
  }

  // Tabla de animales activos
  const tbodyActivos = document.getElementById('tbody-carne-activos');
  if (tbodyActivos) {
    tbodyActivos.innerHTML = activos.map(function(a){
      const pesajesA = db.pesajes.filter(function(p){ return p.animalId===a.id; }).sort(function(x,y){ return x.fecha<y.fecha?-1:1; });
      const ult = pesajesA.filter(function(p){ return p.tipo==='control'; }).slice(-1)[0];
      const r   = calcularRentabilidadAnimal(a.id);
      const pesoActual = ult?ult.kg:a.peso;
      const kgGanados  = r&&r.kgEntrada>0?pesoActual-r.kgEntrada:'-';
      return '<tr onclick="verFicha(\''+a.id+'\')" style="cursor:pointer">'+
        '<td><code style="color:var(--verde-medio);font-size:0.78rem">'+a.id+'</code></td>'+
        '<td><strong>'+a.nombre+'</strong></td>'+
        '<td>'+(a.raza||'-')+'</td>'+
        '<td>'+(r&&r.kgEntrada?r.kgEntrada+' kg':'-')+'</td>'+
        '<td><strong>'+pesoActual+' kg</strong></td>'+
        '<td style="color:'+(typeof kgGanados==='number'&&kgGanados>=0?'var(--verde-medio)':'var(--rojo)')+'">'+
          (typeof kgGanados==='number'?(kgGanados>=0?'+':'')+kgGanados.toFixed(1)+' kg':'—')+'</td>'+
        '<td>'+(r&&r.costoCompra?moneda(r.costoCompra):'-')+'</td>'+
        '<td>'+(r?moneda(r.costoVacunas):'-')+'</td>'+
        '<td>'+edad(a.nacimiento)+'</td>'+
        '<td><button class="btn btn-sm btn-verde" onclick="event.stopPropagation();abrirModalPesaje(\''+a.id+'\')">+ Pesaje</button></td>'+
        '</tr>';
    }).join('')||'<tr><td colspan="10" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin bovinos activos</td></tr>';
  }

  // Tabla de animales vendidos con rentabilidad
  const tbodyVendidos = document.getElementById('tbody-carne-vendidos');
  if (tbodyVendidos) {
    tbodyVendidos.innerHTML = vendidos.map(function(a){
      const r = calcularRentabilidadAnimal(a.id);
      if (!r) return '';
      const colorGan = r.gananciaMonetaria>=0?'var(--verde-medio)':'var(--rojo)';
      return '<tr>'+
        '<td><strong>'+a.nombre+'</strong><br><small style="color:var(--gris-texto)">'+a.id+'</small></td>'+
        '<td>'+(a.raza||'-')+'</td>'+
        '<td>'+(r.kgEntrada||'-')+' kg<br><small>'+moneda(r.costoCompra)+'</small></td>'+
        '<td>'+r.kgSalida+' kg<br><small>'+moneda(r.precioVenta)+'</small></td>'+
        '<td style="color:'+(r.gananciaKg>=0?'var(--verde-medio)':'var(--rojo)')+'"><strong>'+(r.gananciaKg>=0?'+':'')+r.gananciaKg.toFixed(1)+' kg</strong></td>'+
        '<td style="color:var(--rojo)">'+moneda(r.costoVacunas)+'</td>'+
        '<td style="color:'+colorGan+'"><strong>'+moneda(r.gananciaMonetaria)+'</strong><br>'+
          (r.roi?'<small>ROI '+r.roi+'%</small>':'')+'</td>'+
        '<td>'+r.meses+' meses</td>'+
        '</tr>';
    }).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin animales vendidos aún</td></tr>';
  }
}

function abrirModalPesaje(animalId) {
  abrirModal('modal-pesaje');
  const sel = document.getElementById('p-animal');
  if (sel) sel.value = animalId;
}

// ============================================================
// RENDER — LECHE
// ============================================================
function renderLeche() {
  const vacas = db.animales.filter(function(a){ return a.tipo==='bovino'&&a.sexo==='hembra'&&a.estado==='activo'; });
  const total = db.leche.reduce(function(s,l){ return s+l.litros; },0);
  const ultF  = deduplicar(db.leche.map(function(l){ return l.fecha; })).sort().reverse();
  const hoyT  = ultF[0]?db.leche.filter(function(l){ return l.fecha===ultF[0]; }).reduce(function(s,l){ return s+l.litros; },0):0;
  document.getElementById('stats-leche').innerHTML =
    '<div class="stat-card"><div class="stat-label">Vacas lecheras<span>🐄</span></div><div class="stat-value" style="color:var(--verde-medio)">'+vacas.length+'</div></div>'+
    '<div class="stat-card"><div class="stat-label">Último registro<span>📅</span></div><div class="stat-value" style="font-size:1.1rem;color:var(--verde-claro)">'+hoyT.toFixed(1)+' L</div><div class="stat-sub">'+(fmt(ultF[0])||'Sin datos')+'</div></div>'+
    '<div class="stat-card"><div class="stat-label">Total registrado<span>🥛</span></div><div class="stat-value" style="color:var(--azul)">'+total.toFixed(1)+' L</div></div>';
  document.getElementById('tabla-vacas-leche').innerHTML = vacas.map(function(v){
    const regs=db.leche.filter(function(l){ return l.animalId===v.id; });
    const ul7=regs.slice(-7);
    const prom=ul7.length>0?ul7.reduce(function(s,l){ return s+l.litros; },0)/ul7.length:0;
    return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--gris-borde)">'+
      '<span style="width:100px;font-size:0.85rem;font-weight:600">'+v.nombre+'</span>'+
      '<div style="flex:1"><div class="prog-bar"><div class="prog-fill" style="width:'+Math.min(prom/30*100,100)+'%"></div></div></div>'+
      '<span style="font-size:0.85rem;font-weight:700;color:var(--verde-medio);width:70px;text-align:right">'+prom.toFixed(1)+' L/día</span></div>';
  }).join('')||'<p style="color:var(--gris-texto);font-size:0.85rem">Agrega vacas en "Mis animales"</p>';
  document.getElementById('tbody-leche').innerHTML = db.leche.slice().reverse().slice(0,30).map(function(l){
    const a=db.animales.find(function(x){ return x.id===l.animalId; });
    if (!a||a.estado==='muerto') return '';
    return '<tr><td>'+fmt(l.fecha)+'</td><td><strong>'+((a&&a.nombre)||l.animalId)+'</strong></td><td><strong style="color:var(--verde-medio)">'+l.litros.toFixed(1)+' L</strong></td><td style="color:var(--gris-texto)">'+(l.nota||'-')+'</td></tr>';
  }).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — REPRODUCCIÓN
// ============================================================
function renderReproduccion() {
  const activos  = db.animales.filter(function(a){ return a.estado==='activo'; }).map(function(a){ return a.id; });
  const gestantes= db.reproductivo.filter(function(r){ return r.gestante==='si'&&activos.indexOf(r.animalId)!==-1; }).length;
  document.getElementById('total-gestantes').textContent = gestantes;
  document.getElementById('tbody-repro').innerHTML = db.reproductivo
    .filter(function(r){ return activos.indexOf(r.animalId)!==-1; })
    .map(function(r){
      const a=db.animales.find(function(x){ return x.id===r.animalId; });
      const d=r.fechaParto?diasPara(r.fechaParto):null;
      return '<tr>'+
        '<td><strong>'+((a&&a.nombre)||r.animalId)+'</strong> <small>'+(a&&a.tipo==='bovino'?'🐄':'🐎')+'</small></td>'+
        '<td><span class="badge badge-azul">'+r.tipo+'</span></td>'+
        '<td>'+fmt(r.fecha)+'</td><td>'+(r.macho||'-')+'</td>'+
        '<td><select onchange="cambiarGestante(\''+r.id+'\',this.value)" style="padding:5px 7px;border:1px solid var(--gris-borde);border-radius:6px;font-size:0.78rem;background:#fff">'+
          '<option value="no"'+(r.gestante==='no'?' selected':'')+'>No</option>'+
          '<option value="si"'+(r.gestante==='si'?' selected':'')+'>Sí</option>'+
        '</select></td>'+
        '<td>'+fmt(r.fechaParto)+'</td>'+
        '<td>'+(d!==null?'<span class="badge '+(d<=30?'badge-amarillo':'badge-azul')+'">'+(d>0?d+'d':'¡Inminente!')+'</span>':'-')+'</td></tr>';
    }).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin eventos</td></tr>';
}

// ============================================================
// RENDER — SALUD
// ============================================================
function renderSalud() {
  const activos=db.animales.filter(function(a){ return a.estado==='activo'; }).map(function(a){ return a.id; });
  const alertas=calcularAlertas();
  const body=document.getElementById('alertas-salud-body');
  if (body) {
    if (alertas.length===0) {
      body.innerHTML='<p style="color:var(--gris-texto);font-size:0.85rem">✅ Sin alertas</p>';
    } else {
      body.innerHTML=alertas.map(function(a){
        return '<div class="alerta-item '+(a.dias<0?'alerta-roja':a.urgente?'alerta-amarilla':'alerta-azul')+'">' +
          '<div><strong style="font-size:0.85rem">'+a.animal+' — '+a.tipo+'</strong><p style="font-size:0.78rem;color:var(--gris-texto)">'+a.desc+'</p></div>'+
          '<span class="badge '+(a.dias<0?'badge-rojo':a.urgente?'badge-amarillo':'badge-azul')+'">'+(a.dias<0?'Vencida hace '+Math.abs(a.dias)+'d':a.dias===0?'¡Hoy!':'En '+a.dias+'d')+'</span></div>';
      }).join('');
    }
  }
  const tipoIcon={vacuna:'💉',desparasitacion:'🪱',herraje:'🔩',odontologia:'🦷',vitamina:'💊',otro:'🏥'};
  document.getElementById('tbody-salud').innerHTML = db.salud
    .filter(function(s){ return activos.indexOf(s.animalId)!==-1; })
    .map(function(s){
      const a=db.animales.find(function(x){ return x.id===s.animalId; });
      return '<tr>'+
        '<td><strong>'+((a&&a.nombre)||s.animalId)+'</strong> <small>'+(a&&a.tipo==='bovino'?'🐄':'🐎')+'</small></td>'+
        '<td><span class="badge badge-gris">'+(tipoIcon[s.tipo]||'🏥')+' '+s.tipo+'</span></td>'+
        '<td>'+(s.desc||'-')+'</td>'+
        '<td>'+(s.medicamento||'-')+(s.dosis?' · '+s.dosis:'')+'</td>'+
        '<td>'+(s.costo?moneda(s.costo):'-')+'</td>'+
        '<td>'+fmt(s.fecha)+'</td>'+
        '<td>'+(s.proxima?'<span class="badge '+(diasPara(s.proxima)<=7?'badge-rojo':'badge-amarillo')+'">'+fmt(s.proxima)+'</span>':'-')+'</td>'+
        '<td>'+(s.veterinario||'-')+'</td></tr>';
    }).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — ALIMENTACIÓN
// ============================================================
function renderAlimentacion() {
  ['heno','concentrado'].forEach(function(tipo){
    const rs=db.alimentacion.filter(function(a){ return a.tipo===tipo; });
    const ul=rs[rs.length-1];
    const id=tipo==='heno'?'resumen-heno':'resumen-concentrado';
    if (!ul){ document.getElementById(id).innerHTML='<p style="color:var(--gris-texto);font-size:0.85rem">Sin registros.</p>'; return; }
    const totalKg=ul.cantidad*ul.kg;
    const dias=ul.consumoDiario>0?Math.floor(totalKg/ul.consumoDiario):0;
    const fa=new Date(ul.fecha); fa.setDate(fa.getDate()+dias);
    const diasRes=diasPara(fa.toISOString().split('T')[0]);
    document.getElementById(id).innerHTML=
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:0.75rem">'+
        '<div><p style="font-size:0.7rem;color:var(--gris-texto);font-weight:700;text-transform:uppercase">Cantidad</p>'+
          '<p style="font-size:1.3rem;font-weight:700">'+ul.cantidad+' unidades</p>'+
          '<p style="font-size:0.78rem;color:var(--gris-texto)">'+totalKg.toFixed(0)+' kg totales</p></div>'+
        '<div><p style="font-size:0.7rem;color:var(--gris-texto);font-weight:700;text-transform:uppercase">Duración est.</p>'+
          '<p style="font-size:1.3rem;font-weight:700;color:'+(diasRes!==null&&diasRes<14?'var(--rojo)':'var(--verde-medio)')+'">'+dias+' días</p>'+
          '<p style="font-size:0.78rem;color:var(--gris-texto)">hasta '+fmt(fa.toISOString().split('T')[0])+'</p></div>'+
      '</div>'+
      '<div style="padding:8px 12px;background:var(--crema);border-radius:8px;font-size:0.8rem">'+
        'Consumo diario: <strong>'+ul.consumoDiario+' kg/día</strong>'+(ul.notas?' · '+ul.notas:'')+(ul.costo?' · Costo: '+moneda(ul.costo):'')+'</div>';
  });
  document.getElementById('tbody-alimento').innerHTML = db.alimentacion.map(function(a){
    const totalKg=a.cantidad*a.kg;
    const dias=a.consumoDiario>0?Math.floor(totalKg/a.consumoDiario):'-';
    return '<tr><td><span class="badge '+(a.tipo==='heno'?'badge-verde':'badge-tierra')+'">'+(a.tipo==='heno'?'🌿 Heno':'🌽 Concentrado')+'</span></td>'+
      '<td>'+fmt(a.fecha)+'</td><td>'+a.cantidad+'</td><td>'+a.kg+' kg</td><td>'+a.consumoDiario+' kg/día</td>'+
      '<td><strong>'+dias+' días</strong></td><td style="color:var(--gris-texto)">'+(a.notas||'-')+'</td></tr>';
  }).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — FINANZAS
// ============================================================
function renderFinanzas() {
  const cats={alimentacion:'🌾 Alimentación',salud:'💉 Salud',infraestructura:'🏗️ Infraestructura',mano_obra:'👷 Mano de obra',compra_animal:'🐄 Compra animal',venta_animal:'💰 Venta animal',otro:'📌 Otro'};
  const gastos  =db.finanzas.filter(function(f){ return f.tipo==='gasto'; });
  const ingresos=db.finanzas.filter(function(f){ return f.tipo==='ingreso'; });
  const tG=gastos.reduce(function(s,f){ return s+f.valor; },0);
  const tI=ingresos.reduce(function(s,f){ return s+f.valor; },0);
  const util=tI-tG;
  document.getElementById('stats-finanzas').innerHTML=
    '<div class="stat-card"><div class="stat-label">Total gastos<span>📉</span></div><div class="stat-value" style="color:var(--rojo);font-size:1.2rem">'+moneda(tG)+'</div></div>'+
    '<div class="stat-card"><div class="stat-label">Total ingresos<span>📈</span></div><div class="stat-value" style="color:var(--verde-medio);font-size:1.2rem">'+moneda(tI)+'</div></div>'+
    '<div class="stat-card"><div class="stat-label">Utilidad neta<span>💹</span></div><div class="stat-value" style="color:'+(util>=0?'var(--verde-medio)':'var(--rojo)')+';font-size:1.2rem">'+moneda(util)+'</div><div class="stat-sub">'+(util>=0?'Positiva ✅':'Negativa ⚠️')+'</div></div>';
  const porCat={};
  gastos.forEach(function(g){ porCat[g.cat]=(porCat[g.cat]||0)+g.valor; });
  document.getElementById('gastos-categoria').innerHTML=Object.entries(porCat).map(function(e){
    return '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:0.83rem;margin-bottom:3px">'+
      '<span>'+(cats[e[0]]||e[0])+'</span><strong>'+moneda(e[1])+'</strong></div>'+
      '<div class="prog-bar"><div class="prog-fill" style="width:'+(tG>0?Math.round(e[1]/tG*100):0)+'%;background:var(--rojo)"></div></div></div>';
  }).join('')||'<p style="color:var(--gris-texto);font-size:0.85rem">Sin gastos</p>';
  document.getElementById('ultimas-trans').innerHTML=db.finanzas.slice().sort(function(a,b){ return b.fecha<a.fecha?-1:1; }).slice(0,6).map(function(f){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.82rem">'+
      '<div><strong>'+f.desc+'</strong><p style="color:var(--gris-texto);font-size:0.75rem">'+fmt(f.fecha)+'</p></div>'+
      '<strong style="color:'+(f.tipo==='ingreso'?'var(--verde-medio)':'var(--rojo)')+'">'+
        (f.tipo==='ingreso'?'+':'−')+moneda(f.valor)+'</strong></div>';
  }).join('')||'<p style="color:var(--gris-texto);font-size:0.85rem">Sin transacciones</p>';
  document.getElementById('tbody-finanzas').innerHTML=db.finanzas.slice().sort(function(a,b){ return b.fecha<a.fecha?-1:1; }).map(function(f){
    return '<tr><td>'+fmt(f.fecha)+'</td>'+
      '<td><span class="badge '+(f.tipo==='ingreso'?'badge-verde':'badge-rojo')+'">'+(f.tipo==='ingreso'?'📈 Ingreso':'📉 Gasto')+'</span></td>'+
      '<td><span class="badge badge-gris">'+(cats[f.cat]||f.cat)+'</span></td>'+
      '<td>'+f.desc+(f.extra?'<small style="color:var(--gris-texto)"> · '+f.extra+'</small>':'')+'</td>'+
      '<td><strong style="color:'+(f.tipo==='ingreso'?'var(--verde-medio)':'var(--rojo)')+'">'+
        (f.tipo==='ingreso'?'+':'−')+moneda(f.valor)+'</strong></td></tr>';
  }).join('')||'<tr><td colspan="5" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — INVENTARIO
// ============================================================
function renderInventario() {
  const total   =db.animales.length;
  const activos =db.animales.filter(function(a){ return a.estado==='activo'; }).length;
  const vendidos=db.animales.filter(function(a){ return a.estado==='vendido'; }).length;
  const muertos =db.animales.filter(function(a){ return a.estado==='muerto'; }).length;
  document.getElementById('stats-inventario').innerHTML=
    '<div class="stat-card"><div class="stat-label">Total animales<span>🐾</span></div><div class="stat-value" style="color:var(--verde-oscuro)">'+total+'</div></div>'+
    '<div class="stat-card"><div class="stat-label">Activos<span>✅</span></div><div class="stat-value" style="color:var(--verde-medio)">'+activos+'</div></div>'+
    '<div class="stat-card"><div class="stat-label">Vendidos<span>💰</span></div><div class="stat-value" style="color:var(--azul)">'+vendidos+'</div></div>'+
    '<div class="stat-card"><div class="stat-label">Bajas<span>❌</span></div><div class="stat-value" style="color:var(--rojo)">'+muertos+'</div></div>';
  document.getElementById('inv-tipos').innerHTML=['bovino','equino'].map(function(tipo){
    const act =db.animales.filter(function(a){ return a.tipo===tipo&&a.estado==='activo'; }).length;
    const vend=db.animales.filter(function(a){ return a.tipo===tipo&&a.estado==='vendido'; }).length;
    const mrt =db.animales.filter(function(a){ return a.tipo===tipo&&a.estado==='muerto'; }).length;
    return '<div style="padding:10px 0;border-bottom:1px solid var(--gris-borde)">'+
      '<p style="font-weight:700;font-size:0.9rem;margin-bottom:6px">'+(tipo==='bovino'?'🐄 Bovinos':'🐎 Equinos')+'</p>'+
      '<div style="display:flex;gap:8px"><span class="badge badge-verde">Activos: '+act+'</span>'+
        '<span class="badge badge-azul">Vendidos: '+vend+'</span>'+
        '<span class="badge badge-rojo">Bajas: '+mrt+'</span></div></div>';
  }).join('');
  const razas={};
  db.animales.filter(function(a){ return a.estado==='activo'; }).forEach(function(a){ razas[a.raza||'Sin raza']=(razas[a.raza||'Sin raza']||0)+1; });
  document.getElementById('inv-razas').innerHTML=Object.entries(razas).sort(function(a,b){ return b[1]-a[1]; }).map(function(e){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gris-borde)">'+
      '<span style="font-size:0.85rem">'+e[0]+'</span><span class="badge badge-gris">'+e[1]+'</span></div>';
  }).join('')||'<p style="font-size:0.85rem;color:var(--gris-texto)">Sin datos</p>';
  document.getElementById('tbody-inventario').innerHTML=db.animales.map(function(a){
    return '<tr onclick="verFicha(\''+a.id+'\')" style="cursor:pointer">'+
      '<td><code style="font-size:0.78rem;color:var(--verde-medio)">'+a.id+'</code></td>'+
      '<td>'+(a.tipo==='bovino'?'🐄':'🐎')+'</td>'+
      '<td><strong>'+a.nombre+'</strong></td>'+
      '<td>'+a.sexo+'</td><td>'+(a.raza||'-')+'</td><td>'+edad(a.nacimiento)+'</td>'+
      '<td>'+a.peso+' kg</td><td>'+badgeEstado(a.estado)+'</td></tr>';
  }).join('');
}

// ============================================================
// EXPORTAR / IMPORTAR CSV
// ============================================================
function exportarCSV() {
  const header=['ID','Tipo','Nombre','Sexo','Raza','Nacimiento','Peso','Estado','Procedencia','KgCompra','PrecioCompra','Notas'];
  const filas=[header].concat(db.animales.map(function(a){
    return [a.id,a.tipo,a.nombre,a.sexo,a.raza,a.nacimiento,a.peso,a.estado,a.procedencia,a.kgCompra||0,a.precioCompra||0,a.notas];
  }));
  const csv=filas.map(function(f){ return f.map(function(c){ return '"'+(c||'')+ '"'; }).join(','); }).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='mi-finca-animales.csv'; a.click(); URL.revokeObjectURL(url);
}

function importarCSV(input) {
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    const lineas=e.target.result.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
    if(lineas.length<2){ alert('⚠️ CSV vacío'); return; }
    const sep=lineas[0].includes(';')?';':',';
    function parseFila(linea){
      const res=[]; let actual=''; let inQ=false;
      for(let i=0;i<linea.length;i++){
        const c=linea[i];
        if(c==='"') inQ=!inQ;
        else if(c===sep&&!inQ){ res.push(actual.trim()); actual=''; }
        else actual+=c;
      }
      res.push(actual.trim()); return res;
    }
    const enc=parseFila(lineas[0]).map(function(h){ return h.toLowerCase().replace(/[^a-z]/gi,''); });
    const ci=function(n){ return enc.findIndex(function(h){ return h.includes(n); }); };
    const iN=ci('nombre'); if(iN===-1){ alert('⚠️ No se encontró columna "Nombre"'); input.value=''; return; }
    const iT=ci('tipo'),iS=ci('sexo'),iR=ci('raza'),iFe=ci('nacimiento')!==-1?ci('nacimiento'):ci('fecha');
    const iP=ci('peso'),iE=ci('estado'),iPr=ci('procedencia')!==-1?ci('procedencia'):ci('origen'),iNo=ci('notas');
    const iKgC=ci('kgcompra')!==-1?ci('kgcompra'):ci('compra');
    const iPrC=ci('preciocompra')!==-1?ci('preciocompra'):ci('precio');
    let agregados=0;
    const nuevos=lineas.slice(1).map(function(linea){
      const cols=parseFila(linea);
      const leer=function(idx){ return (idx>=0&&cols[idx])?cols[idx].replace(/^"|"$/g,'').trim():''; };
      const nombre=leer(iN); if(!nombre) return null;
      const tipoRaw=(leer(iT)||'bovino').toLowerCase();
      const tipo=tipoRaw.includes('equino')||tipoRaw.includes('caball')?'equino':'bovino';
      let nacISO=leer(iFe);
      if(/^\d{2}\/\d{2}\/\d{4}$/.test(nacISO)){ const p=nacISO.split('/'); nacISO=p[2]+'-'+p[1]+'-'+p[0]; }
      agregados++;
      return {
        id:nuevoId(tipo==='bovino'?'BOV':'EQU'),tipo,nombre,
        sexo:(leer(iS)||'hembra').toLowerCase().includes('macho')?'macho':'hembra',
        raza:leer(iR)||'', nacimiento:nacISO,
        peso:Number(leer(iP).replace(/[^\d.]/g,''))||0,
        estado:['vendido','muerto'].includes((leer(iE)||'').toLowerCase())?leer(iE).toLowerCase():'activo',
        procedencia:['nacido','importado'].includes((leer(iPr)||'').toLowerCase())?leer(iPr).toLowerCase():'comprado',
        madre:'',padre:'',notas:leer(iNo)||'',
        kgCompra:Number(leer(iKgC).replace(/[^\d.]/g,''))||0,
        precioCompra:Number(leer(iPrC).replace(/[^\d.]/g,''))||0,
      };
    }).filter(Boolean);
    if(!confirm('✅ '+agregados+' animal(es) para importar. ¿Continuar?')){ input.value=''; return; }
    db.animales=db.animales.concat(nuevos);
    guardarDB(); input.value=''; mostrarPagina('animales');
    alert('✅ '+agregados+' importados');
  };
  reader.readAsText(file,'UTF-8');
}

// ============================================================
// ============================================================
// MÓDULOS NUEVOS v3.0
// ============================================================
// ============================================================

// ============================================================
// 1. NOTIFICACIONES DEL NAVEGADOR — solo si faltan ≤5 días
//    o ya están vencidas
// ============================================================
let notifPermiso = false;

function iniciarNotificaciones() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    notifPermiso = true;
    verificarAlertas5Dias();
  } else if (Notification.permission !== 'denied') {
    // Solo pedimos permiso si hay algo urgente que notificar
    const urgentes = calcularAlertas().filter(function(a) {
      return a.dias <= 5;
    });
    if (urgentes.length > 0) {
      Notification.requestPermission().then(function(p) {
        notifPermiso = p === 'granted';
        if (notifPermiso) verificarAlertas5Dias();
      });
    }
  }
}

function verificarAlertas5Dias() {
  // Solo alertas que faltan ≤5 días O ya vencidas
  const alertas = calcularAlertas().filter(function(a) {
    return a.dias <= 5;
  });
  if (alertas.length === 0) return;

  // Agrupar en un solo mensaje para no saturar
  const vencidas  = alertas.filter(function(a) { return a.dias < 0; });
  const proximas  = alertas.filter(function(a) { return a.dias >= 0 && a.dias <= 5; });

  let titulo = '🌿 Mi Finca — Alertas veterinarias';
  let cuerpo = '';

  if (vencidas.length > 0) {
    cuerpo += '⚠️ Vencidas: ' + vencidas.map(function(a) {
      return a.animal + ' (' + a.tipo + ')';
    }).join(', ') + '\n';
  }
  if (proximas.length > 0) {
    cuerpo += '📅 En ' + proximas[0].dias + ' días: ' + proximas.map(function(a) {
      return a.animal + ' (' + a.tipo + ')';
    }).join(', ');
  }

  if (!cuerpo) return;

  // Evitar notificación repetida en la misma sesión
  const claveNotif = 'notif_' + hoyISO();
  if (sessionStorage.getItem(claveNotif)) return;
  sessionStorage.setItem(claveNotif, '1');

  try {
    const n = new Notification(titulo, {
      body: cuerpo,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌿</text></svg>',
      tag: 'mifinca-vacunas',
      requireInteraction: false
    });
    n.onclick = function() {
      window.focus();
      mostrarPagina('salud');
      n.close();
    };
    // Auto-cerrar a los 8 segundos
    setTimeout(function() { n.close(); }, 8000);
  } catch(e) { console.log('Notificación bloqueada:', e); }
}

// Verificar cada 4 horas mientras la app está abierta
setInterval(function() {
  if (notifPermiso && usuarioActual) verificarAlertas5Dias();
}, 4 * 60 * 60 * 1000);


// ============================================================
// 2. BÚSQUEDA GLOBAL
// ============================================================
let busquedaAbierta = false;

function abrirBusquedaGlobal() {
  busquedaAbierta = true;
  document.getElementById('modal-busqueda').classList.add('open');
  setTimeout(function() {
    const inp = document.getElementById('busqueda-input');
    if (inp) inp.focus();
  }, 80);
}

function cerrarBusquedaGlobal() {
  busquedaAbierta = false;
  document.getElementById('modal-busqueda').classList.remove('open');
  document.getElementById('busqueda-input').value = '';
  document.getElementById('busqueda-resultados').innerHTML = '';
}

function ejecutarBusqueda() {
  const q = (document.getElementById('busqueda-input').value || '').toLowerCase().trim();
  const cont = document.getElementById('busqueda-resultados');
  if (!q || q.length < 2) {
    cont.innerHTML = '<p class="busqueda-hint">Escribe al menos 2 caracteres...</p>';
    return;
  }

  const resultados = [];

  // Buscar en animales
  db.animales.forEach(function(a) {
    if (a.nombre.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.raza||'').toLowerCase().includes(q)) {
      resultados.push({
        tipo: 'animal',
        icono: a.tipo === 'bovino' ? '🐄' : '🐎',
        titulo: a.nombre,
        subtitulo: a.id + ' · ' + (a.raza||'Sin raza') + ' · ' + edad(a.nacimiento),
        badge: a.estado,
        accion: function() { cerrarBusquedaGlobal(); verFicha(a.id); }
      });
    }
  });

  // Buscar en salud
  db.salud.forEach(function(s) {
    const a = db.animales.find(function(x) { return x.id === s.animalId; });
    const nombreA = a ? a.nombre : s.animalId;
    if ((s.desc||'').toLowerCase().includes(q) ||
        (s.medicamento||'').toLowerCase().includes(q) ||
        nombreA.toLowerCase().includes(q)) {
      resultados.push({
        tipo: 'salud',
        icono: '💉',
        titulo: s.tipo + ' — ' + nombreA,
        subtitulo: (s.desc||'-') + ' · ' + fmt(s.fecha),
        badge: null,
        accion: function() { cerrarBusquedaGlobal(); mostrarPagina('salud'); }
      });
    }
  });

  // Buscar en finanzas
  db.finanzas.forEach(function(f) {
    if ((f.desc||'').toLowerCase().includes(q) ||
        (f.extra||'').toLowerCase().includes(q)) {
      resultados.push({
        tipo: 'finanza',
        icono: f.tipo === 'ingreso' ? '📈' : '📉',
        titulo: f.desc,
        subtitulo: fmt(f.fecha) + ' · ' + moneda(f.valor),
        badge: null,
        accion: function() { cerrarBusquedaGlobal(); mostrarPagina('finanzas'); }
      });
    }
  });

  // Buscar en potreros
  (db.potreros||[]).forEach(function(p) {
    if (p.nombre.toLowerCase().includes(q) ||
        (p.notas||'').toLowerCase().includes(q)) {
      resultados.push({
        tipo: 'potrero',
        icono: '🌿',
        titulo: p.nombre,
        subtitulo: 'Potrero · ' + (p.hectareas||'?') + ' ha · ' + (p.tipo||''),
        badge: null,
        accion: function() { cerrarBusquedaGlobal(); mostrarPagina('potreros'); }
      });
    }
  });

  // Buscar en reproductivo
  db.reproductivo.forEach(function(r) {
    const a = db.animales.find(function(x) { return x.id === r.animalId; });
    const nombreA = a ? a.nombre : r.animalId;
    if (nombreA.toLowerCase().includes(q) ||
        (r.macho||'').toLowerCase().includes(q)) {
      resultados.push({
        tipo: 'reproduccion',
        icono: '🔁',
        titulo: r.tipo + ' — ' + nombreA,
        subtitulo: fmt(r.fecha) + (r.fechaParto ? ' · Parto est: ' + fmt(r.fechaParto) : ''),
        badge: null,
        accion: function() { cerrarBusquedaGlobal(); mostrarPagina('reproduccion'); }
      });
    }
  });

  if (resultados.length === 0) {
    cont.innerHTML = '<p class="busqueda-hint">Sin resultados para "<strong>' + q + '</strong>"</p>';
    return;
  }

  // Agrupar por tipo
  const grupos = { animal:'Animales', salud:'Salud', finanza:'Finanzas', potrero:'Potreros', reproduccion:'Reproducción' };
  const porTipo = {};
  resultados.forEach(function(r) {
    if (!porTipo[r.tipo]) porTipo[r.tipo] = [];
    porTipo[r.tipo].push(r);
  });

  let html = '<p style="font-size:0.75rem;color:var(--gris-texto);margin-bottom:10px">' + resultados.length + ' resultado(s)</p>';
  Object.keys(porTipo).forEach(function(tipo) {
    html += '<p class="busqueda-grupo">' + (grupos[tipo]||tipo) + '</p>';
    porTipo[tipo].slice(0, 6).forEach(function(r, i) {
      html += '<div class="busqueda-item" onclick="busResultados[' + (Object.keys(porTipo).indexOf(tipo)*10+i) + '].accion()">' +
        '<span class="busqueda-item-icono">' + r.icono + '</span>' +
        '<div class="busqueda-item-texto">' +
          '<p class="busqueda-item-titulo">' + r.titulo + '</p>' +
          '<p class="busqueda-item-sub">' + r.subtitulo + '</p>' +
        '</div>' +
        (r.badge ? '<span class="badge badge-gris">' + r.badge + '</span>' : '') +
        '</div>';
    });
  });

  // Guardar referencias a funciones de acción
  window.busResultados = [];
  Object.keys(porTipo).forEach(function(tipo, ti) {
    porTipo[tipo].slice(0, 6).forEach(function(r, i) {
      window.busResultados[ti*10+i] = r;
    });
  });

  cont.innerHTML = html;
}

// Atajo teclado: Ctrl+K o Cmd+K para abrir búsqueda
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (busquedaAbierta) cerrarBusquedaGlobal();
    else if (usuarioActual) abrirBusquedaGlobal();
  }
  if (e.key === 'Escape' && busquedaAbierta) cerrarBusquedaGlobal();
});


// ============================================================
// 3. COMPARAR ANIMALES
// ============================================================
let comparar_A = null;
let comparar_B = null;

function abrirComparador() {
  abrirModal('modal-comparar');
  llenarSelectsComparador();
  document.getElementById('comparar-resultado').innerHTML =
    '<p class="busqueda-hint" style="text-align:center;padding:1.5rem">Selecciona dos animales para comparar</p>';
}

function llenarSelectsComparador() {
  const activos = db.animales.filter(function(a) { return a.estado === 'activo'; });
  ['comparar-a','comparar-b'].forEach(function(id) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccionar animal...</option>';
    activos.forEach(function(a) {
      sel.innerHTML += '<option value="' + a.id + '">' +
        (a.tipo==='bovino'?'🐄':'🐎') + ' ' + a.nombre + ' (' + a.id + ')</option>';
    });
  });
}

function ejecutarComparador() {
  const idA = document.getElementById('comparar-a').value;
  const idB = document.getElementById('comparar-b').value;
  if (!idA || !idB) { alert('Selecciona dos animales diferentes'); return; }
  if (idA === idB) { alert('Selecciona animales diferentes'); return; }

  const a1 = db.animales.find(function(x) { return x.id === idA; });
  const a2 = db.animales.find(function(x) { return x.id === idB; });
  if (!a1 || !a2) return;

  const r1 = calcularRentabilidadAnimal(idA);
  const r2 = calcularRentabilidadAnimal(idB);

  const salud1 = db.salud.filter(function(s) { return s.animalId === idA; });
  const salud2 = db.salud.find(function(s) { return s.animalId === idB; });
  const leche1 = db.leche.filter(function(l) { return l.animalId === idA; });
  const leche2 = db.leche.filter(function(l) { return l.animalId === idB; });
  const promL1 = leche1.length > 0 ? (leche1.reduce(function(s,l){return s+l.litros;},0)/leche1.length).toFixed(1) : '-';
  const promL2 = leche2.length > 0 ? (leche2.reduce(function(s,l){return s+l.litros;},0)/leche2.length).toFixed(1) : '-';

  // Calcular puntaje de recomendación de venta (para ganado de carne)
  function puntajeVenta(animal, rent) {
    let pts = 0;
    const edadMeses = Math.floor((new Date()-new Date(animal.nacimiento))/2629800000);
    if (edadMeses >= 18 && edadMeses <= 30) pts += 30; // edad ideal para venta
    if (edadMeses > 30) pts += 15;
    if (rent && rent.gananciaKg >= 100) pts += 25;
    if (rent && rent.gananciaKg >= 150) pts += 10;
    if (animal.peso >= 350) pts += 20;
    if (animal.peso >= 450) pts += 15;
    if (salud1.length < 3) pts += 10; // pocos costos médicos = mejor margen
    return Math.min(pts, 100);
  }

  const pts1 = puntajeVenta(a1, r1);
  const pts2 = puntajeVenta(a2, r2);

  function celd(val1, val2, unidad, mayorEsMejor) {
    unidad = unidad || '';
    const mejor = mayorEsMejor !== false
      ? (Number(val1) >= Number(val2) ? 'A' : 'B')
      : (Number(val1) <= Number(val2) ? 'A' : 'B');
    const cls1 = (mejor==='A' && val1!=='-') ? 'comparar-ganador' : '';
    const cls2 = (mejor==='B' && val2!=='-') ? 'comparar-ganador' : '';
    return '<td class="' + cls1 + '">' + val1 + unidad + '</td>' +
           '<td class="' + cls2 + '">' + val2 + unidad + '</td>';
  }

  const html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
    '<div class="comparar-cab" style="background:var(--verde-pastel)">' +
      '<div style="font-size:2rem">' + (a1.tipo==='bovino'?'🐄':'🐎') + '</div>' +
      '<div><strong>' + a1.nombre + '</strong><br>' +
      '<small>' + a1.id + ' · ' + (a1.raza||'-') + '</small></div>' +
      '<div class="comparar-puntaje" style="color:' + (pts1>=pts2?'var(--verde-medio)':'var(--gris-texto)') + '">' +
        pts1 + '<small>/100</small></div>' +
    '</div>' +
    '<div class="comparar-cab" style="background:var(--azul-pastel)">' +
      '<div style="font-size:2rem">' + (a2.tipo==='bovino'?'🐄':'🐎') + '</div>' +
      '<div><strong>' + a2.nombre + '</strong><br>' +
      '<small>' + a2.id + ' · ' + (a2.raza||'-') + '</small></div>' +
      '<div class="comparar-puntaje" style="color:' + (pts2>=pts1?'var(--azul)':'var(--gris-texto)') + '">' +
        pts2 + '<small>/100</small></div>' +
    '</div>' +
  '</div>' +
  '<table class="comparar-tabla"><thead><tr>' +
    '<th>Característica</th><th style="background:rgba(82,183,136,0.1)">' + a1.nombre + '</th>' +
    '<th style="background:rgba(26,111,168,0.1)">' + a2.nombre + '</th>' +
  '</tr></thead><tbody>' +
    '<tr><td>Edad</td>' + celd(edad(a1.nacimiento), edad(a2.nacimiento), '', false) + '</tr>' +
    '<tr><td>Peso actual</td>' + celd(a1.peso, a2.peso, ' kg') + '</tr>' +
    '<tr><td>Kg en entrada</td>' + celd(r1&&r1.kgEntrada||a1.kgCompra||'-', r2&&r2.kgEntrada||a2.kgCompra||'-', ' kg') + '</tr>' +
    '<tr><td>Kg ganados</td>' + celd(r1&&r1.kgEntrada?((r1.pesoActual-r1.kgEntrada).toFixed(1)):'-', r2&&r2.kgEntrada?((r2.pesoActual-r2.kgEntrada).toFixed(1)):'-', ' kg') + '</tr>' +
    '<tr><td>Costo compra</td>' + celd(r1?moneda(r1.costoCompra):'-', r2?moneda(r2.costoCompra):'-', '', false) + '</tr>' +
    '<tr><td>Costo vacunas</td>' + celd(r1?moneda(r1.costoVacunas):'-', r2?moneda(r2.costoVacunas):'-', '', false) + '</tr>' +
    '<tr><td>Registros médicos</td>' + celd(db.salud.filter(function(s){return s.animalId===idA;}).length, db.salud.filter(function(s){return s.animalId===idB;}).length, '', false) + '</tr>' +
    (tieneModulo('leche') ? '<tr><td>Prom. leche/día</td>' + celd(promL1, promL2, ' L') + '</tr>' : '') +
    '<tr><td>Procedencia</td><td>' + a1.procedencia + '</td><td>' + a2.procedencia + '</td></tr>' +
    '<tr><td><strong>Puntaje venta</strong></td>' +
      '<td style="font-weight:700;color:' + (pts1>=pts2?'var(--verde-medio)':'var(--gris-texto)') + '">' + pts1 + '/100</td>' +
      '<td style="font-weight:700;color:' + (pts2>=pts1?'var(--azul)':'var(--gris-texto)') + '">' + pts2 + '/100</td>' +
    '</tr>' +
  '</tbody></table>' +
  '<div style="margin-top:14px;padding:12px 16px;border-radius:10px;background:' +
    (pts1>=pts2?'var(--verde-pastel)':'var(--azul-pastel)') + ';font-size:0.85rem">' +
    '💡 <strong>Recomendación:</strong> Considera vender primero a <strong>' +
    (pts1>=pts2?a1.nombre:a2.nombre) + '</strong> (puntaje ' +
    (pts1>=pts2?pts1:pts2) + '/100). ' +
    (pts1>=pts2?
      (a1.peso>=350?'Tiene buen peso.':'Puede ganar más peso.') :
      (a2.peso>=350?'Tiene buen peso.':'Puede ganar más peso.')) +
  '</div>';

  document.getElementById('comparar-resultado').innerHTML = html;
}


// ============================================================
// 4. POTREROS / PESEBRERAS
// ============================================================

// Agregar a normalizarDB y crearDBVacia
const _origNormalizarDB = normalizarDB;
// Extender normalizarDB para incluir potreros
function normalizarDBConPotreros(datos) {
  const base = _origNormalizarDB(datos);
  const seguro = (datos && typeof datos === 'object') ? datos : {};
  base.potreros = Array.isArray(seguro.potreros) ? seguro.potreros : [];
  return base;
}
// Sobreescribir
window.normalizarDB = normalizarDBConPotreros;

function renderPotreros() {
  const potreros = db.potreros || [];

  // Stats
  const statsEl = document.getElementById('stats-potreros');
  if (statsEl) {
    const totalHa   = potreros.reduce(function(s,p) { return s+(Number(p.hectareas)||0); }, 0);
    const ocupados  = potreros.filter(function(p) { return p.tipo==='potrero' && (p.animales||[]).length>0; }).length;
    const pesebreras= potreros.filter(function(p) { return p.tipo==='pesebrera'; }).length;
    statsEl.innerHTML =
      '<div class="stat-card"><div class="stat-label">Potreros<span>🌿</span></div><div class="stat-value" style="color:var(--verde-medio)">' + potreros.filter(function(p){return p.tipo==='potrero';}).length + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Pesebreras<span>🏠</span></div><div class="stat-value" style="color:var(--tierra)">' + pesebreras + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Hectáreas total<span>📐</span></div><div class="stat-value" style="color:var(--azul)">' + totalHa.toFixed(1) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Potreros ocupados<span>✅</span></div><div class="stat-value" style="color:var(--verde-claro)">' + ocupados + '</div></div>';
  }

  const grid = document.getElementById('grid-potreros');
  if (!grid) return;

  if (potreros.length === 0) {
    grid.innerHTML = '<div class="estado-vacio"><div class="ev-icon">🌿</div>' +
      '<h3>Sin potreros registrados</h3>' +
      '<p>Agrega potreros o pesebreras para asignar animales y controlar la rotación.</p>' +
      '<button class="btn btn-verde" onclick="abrirModal(\'modal-potrero\')">+ Crear potrero</button></div>';
    return;
  }

  grid.innerHTML = potreros.map(function(p) {
    const animalesP  = (p.animales||[]);
    const esPesebrera= p.tipo === 'pesebrera';
    const capacidad  = Number(p.capacidad) || (esPesebrera ? 1 : 10);
    const pct        = Math.min(Math.round(animalesP.length / capacidad * 100), 100);
    const colorBarra = pct >= 90 ? 'var(--rojo)' : pct >= 70 ? 'var(--amarillo)' : 'var(--verde-claro)';
    const animNombres= animalesP.map(function(id) {
      const a = db.animales.find(function(x) { return x.id===id; });
      return a ? (a.tipo==='bovino'?'🐄':'🐎')+' '+a.nombre : id;
    });

    return '<div class="potrero-card">' +
      '<div class="potrero-header">' +
        '<span class="potrero-icono">' + (esPesebrera?'🏠':'🌿') + '</span>' +
        '<div>' +
          '<h3 class="potrero-nombre">' + p.nombre + '</h3>' +
          '<p class="potrero-meta">' +
            (esPesebrera ? 'Pesebrera' : 'Potrero · ' + (p.hectareas||'?') + ' ha') +
            (p.pasto ? ' · ' + p.pasto : '') + '</p>' +
        '</div>' +
        '<div style="margin-left:auto;display:flex;gap:6px">' +
          '<button class="btn btn-sm btn-outline" onclick="editarPotrero(\'' + p.id + '\')">✏️</button>' +
          '<button class="btn btn-sm btn-rojo"    onclick="eliminarPotrero(\'' + p.id + '\')">🗑️</button>' +
        '</div>' +
      '</div>' +
      '<div class="potrero-ocup">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:4px">' +
          '<span>' + animalesP.length + ' / ' + capacidad + ' animales</span>' +
          '<span style="color:' + colorBarra + '">' + pct + '%</span>' +
        '</div>' +
        '<div class="prog-bar"><div class="prog-fill" style="width:' + pct + '%;background:' + colorBarra + '"></div></div>' +
      '</div>' +
      (animNombres.length > 0 ?
        '<div class="potrero-animales">' +
          animNombres.map(function(n) { return '<span class="potrero-chip">' + n + '</span>'; }).join('') +
        '</div>' : '<p style="font-size:0.78rem;color:var(--gris-texto);margin-top:8px">Sin animales asignados</p>') +
      (p.notas ? '<p style="font-size:0.75rem;color:var(--gris-texto);margin-top:8px;border-top:1px solid var(--gris-borde);padding-top:6px">📝 ' + p.notas + '</p>' : '') +
      '<div style="margin-top:10px;display:flex;gap:6px">' +
        '<button class="btn btn-sm btn-verde" style="flex:1" onclick="abrirAsignarAnimal(\'' + p.id + '\')">+ Asignar animal</button>' +
        (animalesP.length>0?'<button class="btn btn-sm btn-outline" onclick="abrirRotacion(\'' + p.id + '\')">🔄 Rotar</button>':'') +
      '</div>' +
    '</div>';
  }).join('');
}

function guardarPotrero() {
  const nombre = document.getElementById('pt-nombre').value.trim();
  if (!nombre) { alert('El nombre es obligatorio'); return; }
  const id = document.getElementById('pt-id-edicion').value || nuevoId('PT');
  const potrero = {
    id,
    nombre,
    tipo:      document.getElementById('pt-tipo').value,
    hectareas: Number(document.getElementById('pt-hectareas').value)||0,
    capacidad: Number(document.getElementById('pt-capacidad').value)||10,
    pasto:     document.getElementById('pt-pasto').value,
    notas:     document.getElementById('pt-notas').value,
    animales:  [],
    creadoEn:  hoyISO()
  };
  if (!db.potreros) db.potreros = [];
  const idx = db.potreros.findIndex(function(p) { return p.id===id; });
  if (idx !== -1) {
    potrero.animales = db.potreros[idx].animales || [];
    db.potreros[idx] = potrero;
  } else {
    db.potreros.push(potrero);
  }
  guardarDB();
  cerrarModal('modal-potrero');
  renderPotreros();
  limpiarFormPotrero();
  showToast('✅ Potrero guardado');
}

function limpiarFormPotrero() {
  ['pt-nombre','pt-hectareas','pt-capacidad','pt-pasto','pt-notas'].forEach(function(id) {
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('pt-id-edicion').value = '';
  document.getElementById('pt-tipo').value = 'potrero';
}

function editarPotrero(id) {
  const p = (db.potreros||[]).find(function(x) { return x.id===id; });
  if (!p) return;
  document.getElementById('pt-id-edicion').value  = p.id;
  document.getElementById('pt-nombre').value      = p.nombre;
  document.getElementById('pt-tipo').value        = p.tipo;
  document.getElementById('pt-hectareas').value   = p.hectareas;
  document.getElementById('pt-capacidad').value   = p.capacidad;
  document.getElementById('pt-pasto').value       = p.pasto||'';
  document.getElementById('pt-notas').value       = p.notas||'';
  abrirModal('modal-potrero');
}

function eliminarPotrero(id) {
  if (!confirm('¿Eliminar este potrero/pesebrera?')) return;
  db.potreros = (db.potreros||[]).filter(function(p) { return p.id!==id; });
  guardarDB();
  renderPotreros();
}

function abrirAsignarAnimal(potreroId) {
  document.getElementById('asig-potrero-id').value = potreroId;
  const sel = document.getElementById('asig-animal');
  sel.innerHTML = '<option value="">Seleccionar animal...</option>';
  const p = (db.potreros||[]).find(function(x){return x.id===potreroId;});
  const yaAsignados = p ? (p.animales||[]) : [];
  db.animales.filter(function(a) { return a.estado==='activo'; }).forEach(function(a) {
    const enEstePotrero = yaAsignados.indexOf(a.id) !== -1;
    sel.innerHTML += '<option value="' + a.id + '"' + (enEstePotrero?' disabled':'') + '>' +
      (a.tipo==='bovino'?'🐄':'🐎') + ' ' + a.nombre +
      (enEstePotrero ? ' (ya asignado)' : '') + '</option>';
  });
  abrirModal('modal-asignar-animal');
}

function guardarAsignacion() {
  const potreroId = document.getElementById('asig-potrero-id').value;
  const animalId  = document.getElementById('asig-animal').value;
  if (!animalId) { alert('Selecciona un animal'); return; }
  if (!db.potreros) db.potreros = [];
  const p = db.potreros.find(function(x) { return x.id===potreroId; });
  if (!p) return;
  if (!p.animales) p.animales = [];

  // Quitar del potrero anterior si estaba en otro
  db.potreros.forEach(function(pt) {
    if (pt.id !== potreroId && pt.animales) {
      pt.animales = pt.animales.filter(function(id) { return id !== animalId; });
    }
  });

  if (p.animales.indexOf(animalId) === -1) p.animales.push(animalId);
  guardarDB();
  cerrarModal('modal-asignar-animal');
  renderPotreros();
}

function abrirRotacion(potreroId) {
  const p = (db.potreros||[]).find(function(x){return x.id===potreroId;});
  if (!p) return;
  document.getElementById('rot-potrero-origen').value = potreroId;
  document.getElementById('rot-potrero-origen-nombre').textContent = p.nombre;

  const sel = document.getElementById('rot-potrero-destino');
  sel.innerHTML = '<option value="">Seleccionar destino...</option>';
  (db.potreros||[]).filter(function(pt) { return pt.id!==potreroId; }).forEach(function(pt) {
    sel.innerHTML += '<option value="' + pt.id + '">' + (pt.tipo==='pesebrera'?'🏠':'🌿') + ' ' + pt.nombre + '</option>';
  });

  const selAnim = document.getElementById('rot-animales');
  selAnim.innerHTML = '';
  (p.animales||[]).forEach(function(id) {
    const a = db.animales.find(function(x){return x.id===id;});
    if (!a) return;
    selAnim.innerHTML += '<label style="display:flex;align-items:center;gap:6px;padding:6px 0;font-size:0.85rem">' +
      '<input type="checkbox" value="' + id + '" checked> ' +
      (a.tipo==='bovino'?'🐄':'🐎') + ' ' + a.nombre + '</label>';
  });

  abrirModal('modal-rotacion');
}

function ejecutarRotacion() {
  const origenId  = document.getElementById('rot-potrero-origen').value;
  const destinoId = document.getElementById('rot-potrero-destino').value;
  if (!destinoId) { alert('Selecciona el potrero de destino'); return; }

  const checkboxes = document.querySelectorAll('#rot-animales input[type=checkbox]:checked');
  const animMover  = Array.from(checkboxes).map(function(cb) { return cb.value; });
  if (animMover.length === 0) { alert('Selecciona al menos un animal'); return; }

  if (!db.potreros) db.potreros = [];
  const origen  = db.potreros.find(function(p){return p.id===origenId;});
  const destino = db.potreros.find(function(p){return p.id===destinoId;});
  if (!origen || !destino) return;

  if (!destino.animales) destino.animales = [];
  animMover.forEach(function(id) {
    origen.animales  = (origen.animales||[]).filter(function(x){return x!==id;});
    if (destino.animales.indexOf(id) === -1) destino.animales.push(id);
  });

  guardarDB();
  cerrarModal('modal-rotacion');
  renderPotreros();
  alert('✅ ' + animMover.length + ' animal(es) movidos a ' + destino.nombre);
}

function quitarAnimalDePotrero(potreroId, animalId) {
  if (!db.potreros) return;
  const p = db.potreros.find(function(x){return x.id===potreroId;});
  if (!p) return;
  p.animales = (p.animales||[]).filter(function(id){return id!==animalId;});
  guardarDB();
  renderPotreros();
}


// ============================================================
// 5. GRÁFICA DE PESO / ENGORDE POR ANIMAL
// ============================================================
function abrirGraficaPeso(animalId) {
  const a = db.animales.find(function(x){return x.id===animalId;});
  if (!a) return;

  const pesajesA = db.pesajes
    .filter(function(p){return p.animalId===animalId;})
    .sort(function(x,y){return x.fecha<y.fecha?-1:1;});

  // Construir serie de datos: entrada + controles + salida
  const puntos = [];
  if (a.kgCompra && a.fechaCompra) {
    puntos.push({ fecha: a.fechaCompra, kg: a.kgCompra, tipo: 'entrada' });
  }
  pesajesA.forEach(function(p) {
    puntos.push({ fecha: p.fecha, kg: p.kg, tipo: p.tipo });
  });
  // Si no hay pesaje registrado pero tiene peso actual, agregar hoy
  if (puntos.length === 0 && a.peso) {
    puntos.push({ fecha: a.nacimiento||hoyISO(), kg: a.peso, tipo: 'control' });
  }

  document.getElementById('grafica-peso-titulo').textContent =
    '📈 Curva de engorde — ' + a.nombre;

  const contenedor = document.getElementById('grafica-peso-svg');
  if (puntos.length < 2) {
    contenedor.innerHTML = '<p style="text-align:center;color:var(--gris-texto);padding:2rem">Se necesitan al menos 2 pesajes para ver la gráfica.<br><small>Registra más pesajes en el módulo de Ganado de carne.</small></p>';
    abrirModal('modal-grafica-peso');
    return;
  }

  // Dimensiones del SVG
  const W=520, H=220, PAD={t:20,r:20,b:40,l:55};
  const innerW = W-PAD.l-PAD.r;
  const innerH = H-PAD.t-PAD.b;

  const kgMin = Math.min.apply(null, puntos.map(function(p){return p.kg;}))*0.95;
  const kgMax = Math.max.apply(null, puntos.map(function(p){return p.kg;}))*1.05;
  const fechaMin = new Date(puntos[0].fecha).getTime();
  const fechaMax = new Date(puntos[puntos.length-1].fecha).getTime();
  const rangoF   = fechaMax - fechaMin || 1;

  function mapX(fecha) {
    return PAD.l + ((new Date(fecha).getTime()-fechaMin)/rangoF)*innerW;
  }
  function mapY(kg) {
    return PAD.t + (1-(kg-kgMin)/(kgMax-kgMin))*innerH;
  }

  // Construir path
  const path = puntos.map(function(p,i) {
    return (i===0?'M':'L') + mapX(p.fecha).toFixed(1) + ',' + mapY(p.kg).toFixed(1);
  }).join(' ');

  // Area bajo la curva
  const area = path +
    ' L' + mapX(puntos[puntos.length-1].fecha).toFixed(1) + ',' + (PAD.t+innerH) +
    ' L' + PAD.l + ',' + (PAD.t+innerH) + ' Z';

  // Líneas de grilla horizontal
  const pasos = 4;
  let grilla = '';
  for (let i=0;i<=pasos;i++) {
    const y = PAD.t + (i/pasos)*innerH;
    const v = (kgMax - (kgMax-kgMin)*(i/pasos)).toFixed(0);
    grilla += '<line x1="' + PAD.l + '" y1="' + y + '" x2="' + (PAD.l+innerW) + '" y2="' + y + '" stroke="#e2e8e4" stroke-width="1"/>';
    grilla += '<text x="' + (PAD.l-6) + '" y="' + (y+4) + '" text-anchor="end" font-size="10" fill="#888">' + v + ' kg</text>';
  }

  // Puntos y etiquetas
  let puntosHtml = '';
  const colores = { entrada:'#52b788', control:'#1a6fa8', salida:'#c0392b' };
  puntos.forEach(function(p) {
    const cx = mapX(p.fecha), cy = mapY(p.kg);
    const color = colores[p.tipo]||'#2d6a4f';
    puntosHtml += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="5" fill="' + color + '" stroke="white" stroke-width="2">' +
      '<title>' + fmt(p.fecha) + ': ' + p.kg + ' kg (' + p.tipo + ')</title></circle>';
    // Etiqueta kg
    puntosHtml += '<text x="' + cx.toFixed(1) + '" y="' + (cy-9).toFixed(1) + '" text-anchor="middle" font-size="10" fill="' + color + '" font-weight="bold">' + p.kg + '</text>';
  });

  // Etiquetas eje X (fechas)
  let etiqX = '';
  const maxEtiq = Math.min(puntos.length, 6);
  const paso = Math.floor(puntos.length/maxEtiq)||1;
  for (let i=0;i<puntos.length;i+=paso) {
    const x = mapX(puntos[i].fecha);
    etiqX += '<text x="' + x.toFixed(1) + '" y="' + (PAD.t+innerH+14) + '" text-anchor="middle" font-size="9" fill="#888">' +
      puntos[i].fecha.slice(5) + '</text>';
  }

  // Ganancia total
  const kgGanados = (puntos[puntos.length-1].kg - puntos[0].kg).toFixed(1);
  const dias = Math.ceil((new Date(puntos[puntos.length-1].fecha)-new Date(puntos[0].fecha))/86400000)||1;
  const gdDia = (kgGanados/dias).toFixed(2);

  contenedor.innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:' + W + 'px">' +
      grilla +
      '<defs><linearGradient id="grad-eng" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#52b788" stop-opacity="0.3"/>' +
        '<stop offset="100%" stop-color="#52b788" stop-opacity="0.02"/>' +
      '</linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#grad-eng)"/>' +
      '<path d="' + path + '" fill="none" stroke="#2d6a4f" stroke-width="2.5" stroke-linejoin="round"/>' +
      puntosHtml + etiqX +
    '</svg>' +
    '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">' +
      '<div class="stat-card" style="flex:1;min-width:100px"><div class="stat-label">Peso inicial</div><div class="stat-value" style="font-size:1rem">' + puntos[0].kg + ' kg</div></div>' +
      '<div class="stat-card" style="flex:1;min-width:100px"><div class="stat-label">Peso actual</div><div class="stat-value" style="font-size:1rem">' + puntos[puntos.length-1].kg + ' kg</div></div>' +
      '<div class="stat-card" style="flex:1;min-width:100px"><div class="stat-label">Kg ganados</div><div class="stat-value" style="font-size:1rem;color:' + (kgGanados>=0?'var(--verde-medio)':'var(--rojo)') + '">' + (kgGanados>=0?'+':'') + kgGanados + ' kg</div></div>' +
      '<div class="stat-card" style="flex:1;min-width:100px"><div class="stat-label">Ganancia/día</div><div class="stat-value" style="font-size:1rem;color:var(--azul)">' + gdDia + ' kg</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:12px;margin-top:10px;font-size:0.75rem">' +
      '<span><span style="color:#52b788">●</span> Entrada</span>' +
      '<span><span style="color:#1a6fa8">●</span> Control</span>' +
      '<span><span style="color:#c0392b">●</span> Venta</span>' +
    '</div>';

  abrirModal('modal-grafica-peso');
}


// ============================================================
// 6. MANUAL DE USUARIO INTEGRADO
// ============================================================
const MANUAL_SECCIONES = [
  {
    id: 'inicio',
    icono: '🏠',
    titulo: 'Primeros pasos',
    contenido: [
      { subtitulo: '¿Cómo empezar?', texto: 'Al abrir la app por primera vez, debes conectar Firebase (base de datos gratuita en la nube). Sigue los 5 pasos de la pantalla de configuración inicial. Solo se hace una vez.' },
      { subtitulo: 'Crear tu cuenta', texto: 'En la pantalla de inicio de sesión, ve a la pestaña "Crear cuenta". Ingresa tu correo, contraseña y nombre de tu finca. Elige el tipo de finca que mejor te describe — esto define qué módulos verás.' },
      { subtitulo: 'Tipos de finca disponibles', texto: '� Ganado de carne: control de peso y rentabilidad.\n🐎 Solo caballos: manejo equino sin módulo de leche.\n🐄🐎 Mixto: bovinos y equinos con leche y carne.\n🌿 Completo: todos los módulos disponibles.' },
      { subtitulo: 'Cambiar tipo de finca', texto: 'Puedes cambiar el perfil en cualquier momento desde el botón "Configurar finca" en el panel principal. Los datos ya guardados no se pierden.' },
    ]
  },
  {
    id: 'animales',
    icono: '🐄',
    titulo: 'Gestión de animales',
    contenido: [
      { subtitulo: 'Agregar un animal', texto: 'Ve a "Mis animales" → botón "+ Agregar animal". Los campos obligatorios son: tipo, nombre, sexo, fecha de nacimiento y peso. El ID se genera automáticamente (BOV-XXXX para bovinos, EQU-XXXX para equinos).' },
      { subtitulo: 'Ficha completa', texto: 'Haz clic en cualquier fila de la tabla para ver la ficha completa del animal: datos generales, genealogía, historial médico, producción de leche y rentabilidad de carne.' },
      { subtitulo: 'Genealogía', texto: 'Al registrar un animal puedes indicar el ID de la madre y el padre (deben estar registrados en el sistema). La ficha mostrará el árbol genealógico.' },
      { subtitulo: 'Datos de entrada para carne', texto: 'Si tienes el módulo de ganado de carne, al registrar un bovino puedes ingresar los kg al ingresar y el precio de compra. Estos datos son la base para calcular la rentabilidad.' },
      { subtitulo: 'Estados del animal', texto: 'Activo: en la finca.\nVendido: ya salió por venta.\nMuerto/Baja: falleció o fue descartado.\nLos animales vendidos o muertos se pueden consultar pero ya no aparecen en módulos activos.' },
    ]
  },
  {
    id: 'carne',
    icono: '🥩',
    titulo: 'Ganado de carne y engorde',
    contenido: [
      { subtitulo: '¿Cómo funciona el módulo de carne?', texto: 'Registras pesajes a lo largo del tiempo. El sistema calcula automáticamente cuánto peso ganó el animal, cuánto costó (compra + vacunas) y cuánto ganaste al venderlo.' },
      { subtitulo: 'Tipos de pesaje', texto: '🟢 Entrada / Compra: el primer pesaje al ingresar el animal. Registra también el precio pagado.\n📊 Control de peso: pesajes periódicos para ver el progreso.\n🔴 Salida / Venta: pesaje al vender. El sistema automáticamente calcula la ganancia neta y registra el ingreso en finanzas.' },
      { subtitulo: 'Ver la curva de engorde', texto: 'En la tabla de "Animales en engorde" hay un botón "📈 Ver gráfica" por animal. Muestra la curva de peso en el tiempo, kg ganados totales y ganancia diaria.' },
      { subtitulo: 'Rentabilidad por animal', texto: 'La rentabilidad = Precio de venta − Precio de compra − Costo de vacunas y tratamientos. El ROI (%) indica si el negocio fue rentable. Se muestra en la ficha del animal y en el módulo de carne.' },
      { subtitulo: '¿Qué son los costos de vacunas?', texto: 'Cada vacuna o tratamiento registrado en el módulo de Salud con un costo asignado se suma automáticamente al costo total del animal. Por eso es importante registrar el valor de cada vacuna.' },
    ]
  },
  {
    id: 'salud',
    icono: '💉',
    titulo: 'Salud, vacunas y alertas',
    contenido: [
      { subtitulo: 'Registrar un evento médico', texto: 'Ve a "Salud y vacunas" → "+ Registrar evento médico". Selecciona el animal, el tipo (vacuna, desparasitación, herraje, etc.), la fecha y —muy importante— la fecha de la próxima aplicación para que el sistema genere alertas.' },
      { subtitulo: 'Sistema de alertas', texto: 'El sistema solo te alerta cuando faltan 5 días o menos para una vacuna, o cuando ya está vencida. No te molesta con alertas que están lejos. Las alertas aparecen en el panel principal, en el ícono rojo de la barra superior y en el módulo de salud.' },
      { subtitulo: 'Notificaciones del navegador', texto: 'La primera vez que hay una alerta urgente, el navegador te pedirá permiso para enviar notificaciones. Si lo aceptas, recibirás un aviso aunque la app no esté en primer plano. Solo se envía una vez por día.' },
      { subtitulo: 'Costo de los tratamientos', texto: 'Registra el costo de cada vacuna o tratamiento. Este valor se acumula en el historial del animal y se resta al calcular la rentabilidad de carne.' },
    ]
  },
  {
    id: 'potreros',
    icono: '🌿',
    titulo: 'Potreros y pesebreras',
    contenido: [
      { subtitulo: 'Crear un potrero o pesebrera', texto: 'Ve al módulo "Potreros" → "+ Crear potrero". Ingresa el nombre, tipo (potrero o pesebrera), hectáreas, capacidad y tipo de pasto. Puedes crear tantos como necesites.' },
      { subtitulo: 'Asignar animales', texto: 'En la tarjeta de cada potrero, usa el botón "+ Asignar animal". Un animal solo puede estar en un potrero a la vez — si lo asignas a otro, se quita automáticamente del anterior.' },
      { subtitulo: 'Rotación de pastoreo', texto: 'Cuando un potrero tiene animales, aparece el botón "🔄 Rotar". Selecciona qué animales mover y a qué potrero de destino. Ideal para manejo de pastoreo rotacional.' },
      { subtitulo: 'Indicador de ocupación', texto: 'Cada potrero muestra una barra de ocupación: verde (menos del 70%), amarillo (70-90%), rojo (más del 90%). Ayuda a no sobrecargar un potrero.' },
    ]
  },
  {
    id: 'finanzas',
    icono: '💰',
    titulo: 'Control financiero',
    contenido: [
      { subtitulo: 'Registrar gastos', texto: 'Usa el botón "+ Gasto" para cualquier egreso: alimentación, salud, infraestructura, mano de obra, compra de animales. Categoriza cada gasto para ver reportes por categoría.' },
      { subtitulo: 'Registrar ingresos', texto: 'Usa "+ Ingreso" para ventas de animales, leche u otros. Los pesajes tipo "Salida" en el módulo de carne registran automáticamente el ingreso si ingresaste el precio.' },
      { subtitulo: 'Utilidad neta', texto: 'El panel muestra total de gastos, total de ingresos y la utilidad neta (diferencia). Verde = ganancia, Rojo = pérdida.' },
    ]
  },
  {
    id: 'comparar',
    icono: '⚖️',
    titulo: 'Comparar animales',
    contenido: [
      { subtitulo: '¿Para qué sirve?', texto: 'El comparador te ayuda a decidir cuál animal vender primero. Compara dos animales en peso, edad, kg ganados, costos y registros médicos.' },
      { subtitulo: 'Puntaje de venta', texto: 'El sistema calcula un puntaje (0-100) para cada animal basado en: edad óptima de venta (18-30 meses), kg ganados, peso actual y costo médico. El de mayor puntaje es el candidato ideal para venta.' },
      { subtitulo: 'Cómo acceder', texto: 'En el módulo "Ganado de carne" o "Mis animales" hay un botón "⚖️ Comparar animales". También puedes abrirlo desde el panel principal.' },
    ]
  },
  {
    id: 'busqueda',
    icono: '🔍',
    titulo: 'Búsqueda global',
    contenido: [
      { subtitulo: '¿Cómo buscar?', texto: 'Haz clic en el ícono de lupa 🔍 de la barra superior, o presiona Ctrl+K (Windows/Linux) o Cmd+K (Mac). Escribe el nombre de un animal, medicamento, descripción de gasto o nombre de potrero.' },
      { subtitulo: '¿Qué encuentra?', texto: 'La búsqueda encuentra: animales (por nombre, ID o raza), eventos de salud (por animal o medicamento), transacciones financieras (por descripción), potreros y eventos reproductivos.' },
      { subtitulo: 'Acceso rápido', texto: 'Haz clic en cualquier resultado para ir directamente al módulo correspondiente o abrir la ficha del animal.' },
    ]
  },
  {
    id: 'datos',
    icono: '📦',
    titulo: 'Exportar e importar datos',
    contenido: [
      { subtitulo: 'Exportar a CSV', texto: 'El botón "📥 CSV" en la barra superior exporta el listado completo de animales en formato CSV (compatible con Excel). Incluye ID, tipo, nombre, sexo, raza, nacimiento, peso, estado, kg de compra y precio.' },
      { subtitulo: 'Importar desde CSV', texto: 'El botón "📤 Importar" permite cargar animales desde un archivo CSV. El sistema detecta automáticamente las columnas por nombre. Columnas mínimas: Nombre, Tipo, Sexo, Nacimiento, Peso.' },
      { subtitulo: 'Sincronización automática', texto: 'Todos los datos se guardan automáticamente en Firebase (nube) y en el navegador local. El ícono de la barra lateral muestra el estado: verde = sincronizado, amarillo = guardando, rojo = error de conexión.' },
    ]
  },
];

function abrirManual(seccionId) {
  abrirModal('modal-manual');
  renderManual(seccionId || 'inicio');
}

function renderManual(seccionId) {
  // Marcar sección activa en el menú
  document.querySelectorAll('.manual-nav-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.seccion === seccionId);
  });

  const seccion = MANUAL_SECCIONES.find(function(s) { return s.id === seccionId; });
  if (!seccion) return;

  const contenedor = document.getElementById('manual-contenido');
  contenedor.innerHTML =
    '<h2 style="font-family:\'Playfair Display\',serif;color:var(--verde-oscuro);margin-bottom:1.2rem;font-size:1.3rem">' +
      seccion.icono + ' ' + seccion.titulo + '</h2>' +
    seccion.contenido.map(function(bloque) {
      return '<div class="manual-bloque">' +
        '<h4 class="manual-subtitulo">' + bloque.subtitulo + '</h4>' +
        '<p class="manual-texto">' + bloque.texto.replace(/\n/g, '<br>') + '</p>' +
      '</div>';
    }).join('');
}

function construirNavManual() {
  const nav = document.getElementById('manual-nav');
  if (!nav) return;
  nav.innerHTML = MANUAL_SECCIONES.map(function(s) {
    return '<div class="manual-nav-item" data-seccion="' + s.id + '" onclick="renderManual(\'' + s.id + '\')">' +
      s.icono + ' ' + s.titulo + '</div>';
  }).join('');
}


// ============================================================
// HELPER: botón de gráfica en tabla de carne
// (sobreescribir renderCarne para agregar botón de gráfica)
// ============================================================
const _origRenderCarne = renderCarne;
function renderCarne() {
  _origRenderCarne();
  // Reemplazar contenido de tbody-carne-activos para incluir botón gráfica
  const tbodyActivos = document.getElementById('tbody-carne-activos');
  if (!tbodyActivos) return;
  const activos = db.animales.filter(function(a){ return a.tipo==='bovino'&&a.estado==='activo'; });
  tbodyActivos.innerHTML = activos.map(function(a){
    const pesajesA = db.pesajes.filter(function(p){ return p.animalId===a.id; }).sort(function(x,y){ return x.fecha<y.fecha?-1:1; });
    const ult = pesajesA.filter(function(p){ return p.tipo==='control'; }).slice(-1)[0];
    const r   = calcularRentabilidadAnimal(a.id);
    const pesoActual = ult?ult.kg:a.peso;
    const kgGanados  = r&&r.kgEntrada>0?pesoActual-r.kgEntrada:'-';
    return '<tr onclick="verFicha(\''+a.id+'\')" style="cursor:pointer">'+
      '<td><code style="color:var(--verde-medio);font-size:0.78rem">'+a.id+'</code></td>'+
      '<td><strong>'+a.nombre+'</strong></td>'+
      '<td>'+(a.raza||'-')+'</td>'+
      '<td>'+(r&&r.kgEntrada?r.kgEntrada+' kg':'-')+'</td>'+
      '<td><strong>'+pesoActual+' kg</strong></td>'+
      '<td style="color:'+(typeof kgGanados==='number'&&kgGanados>=0?'var(--verde-medio)':'var(--rojo)')+'">'+
        (typeof kgGanados==='number'?(kgGanados>=0?'+':'')+kgGanados.toFixed(1)+' kg':'—')+'</td>'+
      '<td>'+(r&&r.costoCompra?moneda(r.costoCompra):'-')+'</td>'+
      '<td>'+(r?moneda(r.costoVacunas):'-')+'</td>'+
      '<td>'+edad(a.nacimiento)+'</td>'+
      '<td style="display:flex;gap:4px">'+
        '<button class="btn btn-sm btn-verde" onclick="event.stopPropagation();abrirModalPesaje(\''+a.id+'\')">+ Pesaje</button>'+
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();abrirGraficaPeso(\''+a.id+'\')" title="Ver curva de engorde">📈</button>'+
      '</td>'+
      '</tr>';
  }).join('')||'<tr><td colspan="10" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin bovinos activos</td></tr>';
}

// ============================================================
// ============================================================
// SISTEMA DE ROLES Y USUARIOS — v4.0
// ============================================================
// Estructura en Firestore:
//   usuarios/{uidDueño}/trabajadores = [
//     { id, nombre, correo, passHash, rol, activo, creadoEn }
//   ]
//
// Roles:
//   propietario  — todo
//   administrador — todo menos gestión de usuarios
//   ordeñador    — solo leche + ver animales
//   veterinario  — solo salud + ver animales
//   pesador      — solo pesajes + ver animales
//   lectura      — ver todo, sin editar
// ============================================================

// ---- Estado de sesión del trabajador ----
let sesionTrabajador = null; // { id, nombre, correo, rol, uidDueño }
const SESION_TRAB_KEY = 'miFincaSesionTrabajador';

// ---- Permisos por rol ----
const PERMISOS_ROL = {
  propietario: {
    label: '👑 Propietario',
    color: '#1b4332',
    verFinanzas:    true,
    editarFinanzas: true,
    verAnimales:    true,
    editarAnimales: true,
    verSalud:       true,
    editarSalud:    true,
    verLeche:       true,
    editarLeche:    true,
    verCarne:       true,
    editarCarne:    true,
    verRepro:       true,
    editarRepro:    true,
    verPotreros:    true,
    editarPotreros: true,
    verConfig:      true,
    editarConfig:   true,
    gestionUsuarios:true,
  },
  administrador: {
    label: '👨‍💼 Administrador',
    color: '#2d6a4f',
    verFinanzas:    true,
    editarFinanzas: true,
    verAnimales:    true,
    editarAnimales: true,
    verSalud:       true,
    editarSalud:    true,
    verLeche:       true,
    editarLeche:    true,
    verCarne:       true,
    editarCarne:    true,
    verRepro:       true,
    editarRepro:    true,
    verPotreros:    true,
    editarPotreros: true,
    verConfig:      true,
    editarConfig:   false,
    gestionUsuarios:false,
  },
  ordeñador: {
    label: '🧑‍🌾 Ordeñador',
    color: '#52b788',
    verFinanzas:    false,
    editarFinanzas: false,
    verAnimales:    true,
    editarAnimales: false,
    verSalud:       false,
    editarSalud:    false,
    verLeche:       true,
    editarLeche:    true,
    verCarne:       false,
    editarCarne:    false,
    verRepro:       false,
    editarRepro:    false,
    verPotreros:    true,
    editarPotreros: false,
    verConfig:      false,
    editarConfig:   false,
    gestionUsuarios:false,
  },
  veterinario: {
    label: '💉 Veterinario',
    color: '#1a6fa8',
    verFinanzas:    false,
    editarFinanzas: false,
    verAnimales:    true,
    editarAnimales: false,
    verSalud:       true,
    editarSalud:    true,
    verLeche:       false,
    editarLeche:    false,
    verCarne:       false,
    editarCarne:    false,
    verRepro:       true,
    editarRepro:    true,
    verPotreros:    false,
    editarPotreros: false,
    verConfig:      false,
    editarConfig:   false,
    gestionUsuarios:false,
  },
  pesador: {
    label: '⚖️ Pesador',
    color: '#7c5c3c',
    verFinanzas:    false,
    editarFinanzas: false,
    verAnimales:    true,
    editarAnimales: false,
    verSalud:       false,
    editarSalud:    false,
    verLeche:       false,
    editarLeche:    false,
    verCarne:       true,
    editarCarne:    true,
    verRepro:       false,
    editarRepro:    false,
    verPotreros:    false,
    editarPotreros: false,
    verConfig:      false,
    editarConfig:   false,
    gestionUsuarios:false,
  },
  lectura: {
    label: '👁️ Solo lectura',
    color: '#888',
    verFinanzas:    true,
    editarFinanzas: false,
    verAnimales:    true,
    editarAnimales: false,
    verSalud:       true,
    editarSalud:    false,
    verLeche:       true,
    editarLeche:    false,
    verCarne:       true,
    editarCarne:    false,
    verRepro:       true,
    editarRepro:    false,
    verPotreros:    true,
    editarPotreros: false,
    verConfig:      false,
    editarConfig:   false,
    gestionUsuarios:false,
  },
};

// ---- Helper: obtener permisos del usuario actual ----
function getPermisos() {
  if (sesionTrabajador) {
    return PERMISOS_ROL[sesionTrabajador.rol] || PERMISOS_ROL.lectura;
  }
  // El dueño (Firebase Auth) siempre tiene todos los permisos
  return PERMISOS_ROL.propietario;
}

function puedo(permiso) {
  return getPermisos()[permiso] === true;
}

// ---- Hash simple para contraseñas (SHA-256 con Web Crypto) ----
async function hashPass(texto) {
  const enc  = new TextEncoder().encode(texto);
  const buf  = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(function(b) { return b.toString(16).padStart(2, '0'); })
    .join('');
}

// ============================================================
// LOGIN DE TRABAJADORES
// ============================================================

// Mostrar/ocultar tab de trabajador en el login
function cambiarModoLogin(modo) {
  // modo: 'dueno' | 'trabajador'
  const tabD = document.getElementById('tab-dueno');
  const tabT = document.getElementById('tab-trabajador');
  const secD = document.getElementById('seccion-dueno');
  const secT = document.getElementById('seccion-trabajador');
  if (!tabD || !tabT) return;

  if (modo === 'dueno') {
    tabD.classList.add('active');
    tabT.classList.remove('active');
    secD.style.display = 'block';
    secT.style.display = 'none';
  } else {
    tabD.classList.remove('active');
    tabT.classList.add('active');
    secD.style.display = 'none';
    secT.style.display = 'block';
  }
  // Limpiar errores
  ['login-error','login-error-trab'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function mostrarErrorTrabajador(mensaje) {
  const errDiv = document.getElementById('login-error-trab');
  if (!errDiv) return;
  errDiv.textContent = '⚠️ ' + mensaje;
  errDiv.style.display = 'block';
}

async function loginTrabajador() {
  const codigoFinca = (document.getElementById('trab-codigo-finca').value || '').trim();
  const correo      = (document.getElementById('trab-correo').value || '').trim();
  const pass        = (document.getElementById('trab-password').value || '');
  const errDiv      = document.getElementById('login-error-trab');

  if (!codigoFinca || !correo || !pass) {
    mostrarErrorTrabajador('Completa todos los campos');
    return;
  }

  const btn = document.getElementById('btn-login-trab');
  btn.disabled = true;
  errDiv.style.display = 'none';
  mostrarCargando('Verificando credenciales...');

  try {
    // El código de finca es el UID del dueño
    const docRef = firestore.collection('usuarios').doc(codigoFinca);
    const doc    = await docRef.get();

    if (!doc.exists) {
      throw new Error('Código de finca no válido');
    }

    const datos       = doc.data();
    const trabajadores= datos.trabajadores || [];
    const passHash    = await hashPass(pass);

    const trab = trabajadores.find(function(t) {
      return t.correo.toLowerCase() === correo.toLowerCase() &&
             t.passHash === passHash &&
             t.activo !== false;
    });

    if (!trab) {
      throw new Error('Correo o contraseña incorrectos, o usuario inactivo');
    }

    // Sesión válida — cargar datos de la finca del dueño
    sesionTrabajador = {
      id:       trab.id,
      nombre:   trab.nombre,
      correo:   trab.correo,
      rol:      trab.rol,
      uidDueño: codigoFinca
    };
    sessionStorage.setItem(SESION_TRAB_KEY, JSON.stringify(sesionTrabajador));

    // Cargar DB del dueño
    db = normalizarDB(datos);
    localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));

    mostrarAppTrabajador();

  } catch(e) {
    btn.disabled = false;
    mostrarLogin();
    errDiv.textContent = '⚠️ ' + e.message;
    errDiv.style.display = 'block';
    cambiarModoLogin('trabajador');
  }
}

function mostrarAppTrabajador() {
  document.getElementById('pantalla-cargando').style.display = 'none';
  document.getElementById('pantalla-login').style.display    = 'none';
  document.getElementById('app-principal').style.display     = 'block';

  perfilActual = db.config.perfil || 'completo';
  construirNavegacionConRol();

  const p = getPermisos();
  document.getElementById('nombre-usuario').textContent       = sesionTrabajador.nombre;
  document.getElementById('email-usuario').textContent        = p.label || sesionTrabajador.rol;
  document.getElementById('avatar-inicial').textContent       = sesionTrabajador.nombre[0].toUpperCase();
  document.getElementById('sidebar-titulo-finca').textContent = '🌿 ' + db.config.nombre;

  // Mostrar chip de rol
  const chipEl = document.getElementById('chip-rol-usuario');
  if (chipEl) {
    chipEl.textContent  = (PERMISOS_ROL[sesionTrabajador.rol]||{}).label || sesionTrabajador.rol;
    chipEl.style.display= 'inline-flex';
    chipEl.style.background = (PERMISOS_ROL[sesionTrabajador.rol]||{}).color || '#888';
  }

  // Ocultar botones de acción que no corresponden
  aplicarRestriccionesUI();
  mostrarPagina('dashboard');
}

// ---- Verificar si hay sesión de trabajador guardada ----
function verificarSesionTrabajador() {
  const guardada = sessionStorage.getItem(SESION_TRAB_KEY);
  if (!guardada) return false;
  try {
    sesionTrabajador = JSON.parse(guardada);
    return true;
  } catch(e) { return false; }
}

// ---- Cerrar sesión (tanto dueño como trabajador) ----
// La lógica de cierre de sesión y de borrado de sesión de trabajador
// se maneja en cerrarSesionBase().

// ============================================================
// NAVEGACIÓN CON ROL — filtra según permisos
// ============================================================
function construirNavegacionConRol() {
  const perfil  = PERFILES[perfilActual] || PERFILES.completo;
  const perms   = getPermisos();
  const navEl   = document.getElementById('nav-dinamico');
  if (!navEl) return;

  // Filtrar módulos según permisos del rol
  const modulosVisibles = perfil.modulos.filter(function(mod) {
    if (mod === 'finanzas')     return perms.verFinanzas;
    if (mod === 'leche')        return perms.verLeche;
    if (mod === 'carne')        return perms.verCarne;
    if (mod === 'salud')        return perms.verSalud;
    if (mod === 'reproduccion') return perms.verRepro;
    if (mod === 'alimentacion') return true; // todos ven alimentación
    return true; // dashboard, animales, inventario siempre visibles
  });

  navEl.innerHTML = modulosVisibles.map(function(mod) {
    const n = NAV_ITEMS[mod];
    if (!n) return '';
    return '<div class="nav-item' + (mod==='dashboard'?' active':'') + '" ' +
      'onclick="mostrarPagina(\'' + mod + '\')" ' +
      (n.id ? 'id="' + n.id + '"' : '') + '>' +
      '<span class="icon">' + n.icon + '</span> ' + n.label +
      '</div>';
  }).join('');

  // Agregar potreros si tiene permiso
  if (perms.verPotreros) {
    // Sólo añadir si no viene en la lista (evita duplicados)
    if (modulosVisibles.indexOf('potreros') === -1 && !Array.from(navEl.children).some(function(n){ return (n.textContent||'').toLowerCase().indexOf('potrero')!==-1; })) {
      navEl.innerHTML += '<div class="nav-item" onclick="mostrarPagina(\'potreros\')">' +
        '<span class="icon">🌿</span> Potreros</div>';
    }
  }

  // Manual siempre visible (añadir sólo si no existe)
  if (!Array.from(navEl.children).some(function(n){ return (n.textContent||'').toLowerCase().indexOf('manual')!==-1; })) {
    navEl.innerHTML += '<div class="nav-item" onclick="abrirManual(\'inicio\')">' +
      '<span class="icon">📖</span> Manual de uso</div>';
  }

  // Gestión de usuarios solo para propietario (añadir sólo si no existe)
  if (perms.gestionUsuarios && !Array.from(navEl.children).some(function(n){ return (n.textContent||'').toLowerCase().indexOf('usuario')!==-1; })) {
    navEl.innerHTML += '<div class="nav-item" onclick="abrirGestionUsuarios()">' +
      '<span class="icon">👥</span> Usuarios</div>';
  }

  // Mostrar/ocultar páginas
  document.querySelectorAll('.page').forEach(function(pg) {
    const nombre = pg.id.replace('page-','');
    pg.style.display = modulosVisibles.indexOf(nombre) !== -1 ? '' : 'none';
  });

  TITULOS_MOD['potreros'] = '🌿 Potreros y pesebreras';
}

// ---- Aplicar restricciones visuales en botones de edición ----
function aplicarRestriccionesUI() {
  const perms = getPermisos();

  // Ocultar botones según permisos
  const restricciones = [
    { permiso: 'editarAnimales', selectores: ['[onclick*="modal-animal"]','[onclick*="editarAnimal"]','[onclick*="eliminarAnimal"]'] },
    { permiso: 'editarSalud',    selectores: ['[onclick*="modal-salud"]'] },
    { permiso: 'editarLeche',    selectores: ['[onclick*="modal-leche"]'] },
    { permiso: 'editarCarne',    selectores: ['[onclick*="modal-pesaje"]','[onclick*="abrirModalPesaje"]'] },
    { permiso: 'editarRepro',    selectores: ['[onclick*="modal-repro"]'] },
    { permiso: 'editarFinanzas', selectores: ['[onclick*="modal-gasto"]','[onclick*="modal-venta"]'] },
    { permiso: 'editarPotreros', selectores: ['[onclick*="modal-potrero"]','[onclick*="abrirAsignarAnimal"]'] },
    { permiso: 'editarConfig',   selectores: ['[onclick*="modal-config"]'] },
    { permiso: 'gestionUsuarios',selectores: ['[onclick*="abrirGestionUsuarios"]'] },
  ];

  restricciones.forEach(function(r) {
    if (!perms[r.permiso]) {
      r.selectores.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(el) {
          el.style.display = 'none';
        });
      });
    }
  });

  // Ocultar botones de exportar/importar si no es propietario/admin
  if (!perms.editarConfig) {
    const btnImportar = document.querySelector('[onclick*="input-importar"]');
    if (btnImportar) btnImportar.style.display = 'none';
  }
}

// ============================================================
// GESTIÓN DE USUARIOS (solo propietario)
// ============================================================
function abrirGestionUsuarios() {
  if (!puedo('gestionUsuarios')) {
    alert('No tienes permiso para gestionar usuarios');
    return;
  }
  abrirModal('modal-usuarios');
  renderTablaUsuarios();
  actualizarConteoTrabajadores();
  // Mostrar el código de finca (UID del dueño)
  if (usuarioActual) {
    document.getElementById('codigo-finca-display').textContent = usuarioActual.uid;
  }
}

function renderTablaUsuarios() {
  const tbody = document.getElementById('tbody-usuarios');
  if (!tbody) return;
  const trabajadores = db.trabajadores || [];
  actualizarConteoTrabajadores();

  if (trabajadores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gris-texto);padding:1.5rem">' +
      '<div class="estado-vacio" style="padding:1rem">' +
      '<div class="ev-icon">👥</div>' +
      '<h3>Sin usuarios creados</h3>' +
      '<p>Crea el primer usuario para que tu equipo pueda ingresar con permisos limitados.</p>' +
      '</div></td></tr>';
    return;
  }

  tbody.innerHTML = trabajadores.map(function(t) {
    const p        = PERMISOS_ROL[t.rol] || {};
    const colorRol = p.color || '#888';
    const activo   = t.activo !== false;
    return '<tr>' +
      '<td><strong>' + t.nombre + '</strong><br>' +
        '<small style="color:var(--gris-texto)">' + t.correo + '</small></td>' +
      '<td>' +
        '<span class="badge" style="background:' + colorRol + '22;color:' + colorRol + ';border:1px solid ' + colorRol + '44">' +
          (p.label || t.rol) + '</span></td>' +
      '<td><span class="badge ' + (activo ? 'badge-verde' : 'badge-rojo') + '">' +
        (activo ? '● Activo' : '● Inactivo') + '</span></td>' +
      '<td style="font-size:0.75rem;color:var(--gris-texto)">' + (t.creadoEn ? fmt(t.creadoEn) : '-') + '</td>' +
      '<td style="display:flex;gap:4px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-outline" onclick="editarUsuario(\'' + t.id + '\')" title="Editar">✏️</button>' +
        '<button class="btn btn-sm" style="background:var(--azul);color:#fff" onclick="compartirCredenciales(\'' + t.id + '\')" title="Compartir acceso">📤</button>' +
        '<button class="btn btn-sm" style="background:' + (activo ? 'var(--amarillo)' : 'var(--verde-medio)') + ';color:#fff" ' +
          'onclick="toggleUsuario(\'' + t.id + '\')">' +
          (activo ? '⏸' : '▶') + '</button>' +
        '<button class="btn btn-sm btn-rojo" onclick="eliminarUsuario(\'' + t.id + '\')" title="Eliminar">🗑️</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function guardarUsuario() {
  if (!puedo('gestionUsuarios')) return;

  const nombre = document.getElementById('u-nombre').value.trim();
  const correo = document.getElementById('u-correo').value.trim().toLowerCase();
  const pass   = document.getElementById('u-pass').value;
  const rol    = document.getElementById('u-rol').value;
  const idEdit = document.getElementById('u-id-edicion').value;

  if (!nombre || !correo) {
    alert('⚠️ Nombre y correo son obligatorios');
    return;
  }
  if (!idEdit && !pass) {
    alert('⚠️ La contraseña es obligatoria para usuarios nuevos');
    return;
  }
  if (pass && pass.length < 4) {
    alert('⚠️ La contraseña debe tener al menos 4 caracteres');
    return;
  }

  if (!db.trabajadores) db.trabajadores = [];

  // Verificar correo duplicado
  const duplicado = db.trabajadores.find(function(t) {
    return t.correo === correo && t.id !== idEdit;
  });
  if (duplicado) {
    alert('⚠️ Ya existe un usuario con ese correo');
    return;
  }

  let usuario;
  if (idEdit) {
    // Editar existente
    const idx = db.trabajadores.findIndex(function(t) { return t.id === idEdit; });
    if (idx === -1) return;
    usuario = Object.assign({}, db.trabajadores[idx]);
    usuario.nombre = nombre;
    usuario.correo = correo;
    usuario.rol    = rol;
    if (pass) usuario.passHash = await hashPass(pass);
    db.trabajadores[idx] = usuario;
    alert('✅ Usuario "' + nombre + '" actualizado');
  } else {
    // Nuevo usuario
    usuario = {
      id:       nuevoId('USR'),
      nombre,
      correo,
      passHash: await hashPass(pass),
      rol,
      activo:   true,
      creadoEn: hoyISO()
    };
    db.trabajadores.push(usuario);
    alert('✅ Usuario "' + nombre + '" creado\n\n' +
      '📋 Datos para compartir:\n' +
      '• Código de finca: ' + (usuarioActual ? usuarioActual.uid : '-') + '\n' +
      '• Correo: ' + correo + '\n' +
      '• Contraseña: ' + pass + '\n' +
      '• Rol: ' + ((PERMISOS_ROL[rol]||{}).label||rol));
  }

  guardarDB();
  cerrarModal('modal-nuevo-usuario');
  limpiarFormUsuario();
  renderTablaUsuarios();
}

function editarUsuario(id) {
  const t = (db.trabajadores||[]).find(function(x) { return x.id===id; });
  if (!t) return;
  document.getElementById('u-id-edicion').value = t.id;
  document.getElementById('u-nombre').value     = t.nombre;
  document.getElementById('u-correo').value     = t.correo;
  document.getElementById('u-rol').value        = t.rol;
  document.getElementById('u-pass').value       = '';
  document.getElementById('u-pass').placeholder = 'Dejar vacío para no cambiar';
  abrirModal('modal-nuevo-usuario');
}

function toggleUsuario(id) {
  const t = (db.trabajadores||[]).find(function(x) { return x.id===id; });
  if (!t) return;
  t.activo = t.activo === false ? true : false;
  guardarDB();
  renderTablaUsuarios();
}

function eliminarUsuario(id) {
  if (!confirm('¿Eliminar este usuario? No podrá iniciar sesión.')) return;
  db.trabajadores = (db.trabajadores||[]).filter(function(t) { return t.id !== id; });
  guardarDB();
  renderTablaUsuarios();
}

function limpiarFormUsuario() {
  ['u-nombre','u-correo','u-pass','u-id-edicion'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const passEl = document.getElementById('u-pass');
  if (passEl) passEl.placeholder = 'Mínimo 4 caracteres';
  const rolEl = document.getElementById('u-rol');
  if (rolEl) rolEl.value = 'ordeñador';
}

function copiarCodigoFinca() {
  const uid = usuarioActual ? usuarioActual.uid : '';
  navigator.clipboard.writeText(uid).then(function() {
    alert('✅ Código copiado: ' + uid);
  }).catch(function() {
    prompt('Copia este código:', uid);
  });
}

// ============================================================
// ACTUALIZAR normalizarDB para incluir trabajadores
// ============================================================
const _origNormalizarDBv4 = window.normalizarDB || normalizarDB;
window.normalizarDB = function(datos) {
  const base   = _origNormalizarDBv4(datos);
  const seguro = (datos && typeof datos === 'object') ? datos : {};
  base.trabajadores = Array.isArray(seguro.trabajadores) ? seguro.trabajadores : [];
  return base;
};

// ============================================================
// Reinicializar Firebase para detectar sesión de trabajador
// ============================================================
function inicializarFirebase(config) {
  try {
    if (firebase.apps.length > 0) firebase.apps.forEach(function(a){ a.delete(); });
    firebaseApp = firebase.initializeApp(config);
    auth        = firebase.auth();
    firestore   = firebase.firestore();
    document.getElementById('pantalla-configurar').style.display = 'none';
    mostrarCargando('Conectando...');

    auth.onAuthStateChanged(function(user) {
      if (user) {
        usuarioActual    = user;
        sesionTrabajador = null; // dueño logueado, limpiar sesión trabajador
        sessionStorage.removeItem(SESION_TRAB_KEY);
        cargarDatosNube(user.uid);
      } else {
        usuarioActual = null;
        // ¿Hay sesión de trabajador activa?
        if (verificarSesionTrabajador()) {
          // Recargar datos del dueño para el trabajador
          mostrarCargando('Cargando finca...');
          firestore.collection('usuarios').doc(sesionTrabajador.uidDueño).get()
            .then(function(doc) {
              if (doc.exists) {
                db = normalizarDB(doc.data());
                localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));
                mostrarAppTrabajador();
              } else {
                sesionTrabajador = null;
                sessionStorage.removeItem(SESION_TRAB_KEY);
                mostrarLogin();
                cambiarModoLogin('trabajador');
                mostrarErrorTrabajador('Código de finca no válido o finca no existe');
              }
            })
            .catch(function(e) {
              console.error('Error al cargar finca de trabajador:', e);
              sesionTrabajador = null;
              sessionStorage.removeItem(SESION_TRAB_KEY);
              mostrarLogin();
              cambiarModoLogin('trabajador');
              mostrarErrorTrabajador('No se pudo cargar la finca. Verifica el código de finca y tu conexión.');
            });
        } else {
          mostrarLogin();
        }
      }
    });
  } catch(e) { alert('Error Firebase: ' + e.message); }
}

// ============================================================
// mostrarApp para el dueño con navegación por rol
// ============================================================
function mostrarApp(user) {
  document.getElementById('pantalla-cargando').style.display = 'none';
  document.getElementById('pantalla-login').style.display    = 'none';
  document.getElementById('app-principal').style.display     = 'block';

  perfilActual = db.config.perfil || 'completo';
  sesionTrabajador = null; // el dueño siempre entra como propietario
  construirNavegacionConRol();

  const nombre = db.config.propietario || user.displayName || 'Usuario';
  document.getElementById('nombre-usuario').textContent       = nombre;
  document.getElementById('email-usuario').textContent        = '👑 Propietario';
  document.getElementById('avatar-inicial').textContent       = nombre[0].toUpperCase();
  document.getElementById('sidebar-titulo-finca').textContent = '🌿 ' + db.config.nombre;

  const chipEl = document.getElementById('chip-rol-usuario');
  if (chipEl) chipEl.style.display = 'none';

  mostrarPagina('dashboard');
  setTimeout(function() {
    iniciarNotificaciones();
    construirNavManual();
  }, 3000);
}

// ============================================================
// COMPLEMENTOS SISTEMA DE ROLES
// ============================================================

// ---- Banner inferior cuando es sesión de trabajador ----
function mostrarBannerTrabajador() {
  if (!sesionTrabajador) return;
  const existing = document.getElementById('banner-trabajador');
  if (existing) return;
  const p = PERMISOS_ROL[sesionTrabajador.rol] || {};
  const banner = document.createElement('div');
  banner.id = 'banner-trabajador';
  banner.className = 'trabajador-banner';
  banner.innerHTML = (p.label || sesionTrabajador.rol) + ' — ' +
    sesionTrabajador.nombre + ' · ' +
    '<span style="opacity:0.8">Sesión de trabajador</span> · ' +
    '<button onclick="cerrarSesion()" style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:2px 10px;border-radius:10px;cursor:pointer;font-size:0.72rem;font-weight:700;font-family:Nunito">🔒 Salir</button>';
  document.body.appendChild(banner);
  // Agregar padding al main para no tapar contenido
  const main = document.getElementById('main');
  if (main) main.style.paddingBottom = '32px';
}

// ---- Actualizar conteo de trabajadores en el modal ----
function actualizarConteoTrabajadores() {
  const el = document.getElementById('conteo-trabajadores');
  if (el) el.textContent = (db.trabajadores || []).length;
}

// ---- Compartir credenciales de trabajador (botón en tabla) ----
function compartirCredenciales(id) {
  const t = (db.trabajadores || []).find(function(x) { return x.id === id; });
  if (!t || !usuarioActual) return;
  const texto =
    '🌿 Acceso a Mi Finca\n' +
    '─────────────────────\n' +
    '🔑 Código de finca:\n' + usuarioActual.uid + '\n\n' +
    '👤 Correo: ' + t.correo + '\n' +
    '🔐 Contraseña: (la que ingresaste)\n' +
    '👷 Rol: ' + ((PERMISOS_ROL[t.rol] || {}).label || t.rol) + '\n\n' +
    '📱 Abre la app → pestaña "Soy trabajador"\n' +
    '   e ingresa estos datos.';

  if (navigator.share) {
    navigator.share({ title: 'Acceso Mi Finca', text: texto })
      .catch(function() { prompt('Copia y envía al trabajador:', texto); });
  } else {
    prompt('Copia y envía al trabajador:', texto);
  }
}

// ---- Proteger acciones de edición para trabajadores ----
// ---- Proteger acciones de edición para trabajadores ----
// Intercepta llamadas a guardarXxx y verifica permiso de forma idempotente
function _wrapActionWithPerm(functionName, permiso, mensaje) {
  try {
    var fn = window[functionName];
    if (typeof fn !== 'function') return;
    var origKey = '__orig__' + functionName;
    if (!window[origKey]) window[origKey] = fn;
    window[functionName] = function() {
      if (!puedo(permiso)) { showToast(mensaje || 'No tienes permiso para esta acción', 'error'); return; }
      return window[origKey].apply(this, arguments);
    };
  } catch(e) { console.warn('wrap perm error', e); }
}

// Ensure a safe cerrarSesion exists (fallback) so HTML onclicks won't fail
if (typeof window.cerrarSesion !== 'function') {
  window.cerrarSesion = function() {
    if (typeof cerrarSesionBase === 'function') return cerrarSesionBase();
    // Fallback minimal behavior
    sesionTrabajador = null;
    try { sessionStorage.removeItem(SESION_TRAB_KEY); } catch(e){}
    db = crearDBVacia();
    if (typeof mostrarLogin === 'function') mostrarLogin();
  };
}

_wrapActionWithPerm('guardarAnimal','editarAnimales','⚠️ No tienes permiso para editar animales');
_wrapActionWithPerm('guardarLeche','editarLeche','⚠️ No tienes permiso para registrar leche');
_wrapActionWithPerm('guardarSalud','editarSalud','⚠️ No tienes permiso para registrar eventos médicos');
_wrapActionWithPerm('guardarPesaje','editarCarne','⚠️ No tienes permiso para registrar pesajes');
_wrapActionWithPerm('guardarRepro','editarRepro','⚠️ No tienes permiso para registrar eventos reproductivos');
_wrapActionWithPerm('guardarGasto','editarFinanzas','⚠️ No tienes permiso para registrar gastos');
_wrapActionWithPerm('guardarVenta','editarFinanzas','⚠️ No tienes permiso para registrar ingresos');
_wrapActionWithPerm('guardarPotrero','editarPotreros','⚠️ No tienes permiso para gestionar potreros');
_wrapActionWithPerm('guardarConfig','editarConfig','⚠️ No tienes permiso para cambiar la configuración');

// ---- Hook en mostrarAppTrabajador para mostrar banner ----
// Re-wrap mostrarAppTrabajador si existe (idempotente)
if (typeof mostrarAppTrabajador === 'function') {
  var _origMostrarAppTrab = mostrarAppTrabajador;
  window.mostrarAppTrabajador = function() {
    _origMostrarAppTrab();
    setTimeout(function() {
      if (typeof mostrarBannerTrabajador === 'function') mostrarBannerTrabajador();
      // construirNavManual puede duplicar entradas; call only if needed
      if (typeof construirNavManual === 'function') construirNavManual();
      if (typeof iniciarNotificaciones === 'function') iniciarNotificaciones();
    }, 500);
  };
}

// ---- Actualizar cerrarSesion para quitar banner ----
function cerrarSesion() {
  const banner = document.getElementById('banner-trabajador');
  if (banner) banner.remove();
  const main = document.getElementById('main');
  if (main) main.style.paddingBottom = '';
  cerrarSesionBase();
}
