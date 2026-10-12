// Servidor de mentira (en memoria) que imita los endpoints del backend que usa el programa.
// Sirve para probar la interfaz sin tocar datos reales:  node test/mock-server.js  (puerto 4010)
const http = require('http');

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const iso = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString(); };

function seed() {
  const names = [['Lucía', 'Fernández'], ['Martín', 'Gómez'], ['Camila', 'Rossi'], ['Joaquín', 'Pérez'], ['Valentina', 'Ruiz'], ['Santiago', 'Díaz'], ['Micaela', 'Sosa'], ['Facundo', 'Torres'], ['Agustina', 'Romero'], ['Nicolás', 'Álvarez'], ['Sofía', 'Acosta'], ['Tomás', 'Benítez'], ['Julieta', 'Molina'], ['Bruno', 'Silva'], ['Paula', 'Castro'], ['Ignacio', 'Ortiz'], ['Florencia', 'Rojas'], ['Matías', 'Núñez'], ['Carolina', 'Vega'], ['Lautaro', 'Medina']];
  const users = [
    { id: 1, name: 'Ulises', surname: 'Figueroa', email: 'admin@test.com', role: 'admin', username: '30111222', document_type: 'dni', phone: '1140000000', mobile_enabled: true, expires_at: null, created_at: iso(-400) },
  ];
  names.forEach(([name, surname], i) => {
    const exp = [-20, -3, 2, 6, 11, 40, 75, null, 120, 9, 30, 55, -40, 4, 80, 100, 15, 22, 200, 13][i];
    users.push({ id: i + 2, name, surname, email: `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}${i}@mail.com`, role: 'user', username: String(30000000 + i * 1379), document_type: 'dni', phone: `11${50000000 + i * 1111}`, mobile_enabled: i % 4 !== 3, expires_at: exp === null ? null : iso(exp), created_at: iso(-300 + i * 12) });
  });

  const exercises = [
    ['Press de banca', 'Pecho', 4, 8, 'https://youtu.be/rT7DgCr-3pg', 60],
    ['Press inclinado con mancuernas', 'Pecho', 3, 10, 'https://youtu.be/8iPEnn-ltC8', 20],
    ['Aperturas en polea', 'Pecho', 3, 12, null, null],
    ['Sentadilla libre', 'Piernas', 4, 8, 'https://youtu.be/ultWZbUMPL8', 80],
    ['Prensa 45°', 'Piernas', 4, 12, null, 140],
    ['Peso muerto rumano', 'Piernas', 3, 10, 'https://youtu.be/JCXUYuzwNrM', 70],
    ['Dominadas', 'Espalda', 4, 6, null, null],
    ['Remo con barra', 'Espalda', 4, 8, null, 50],
    ['Jalón al pecho', 'Espalda', 3, 12, null, 45],
    ['Press militar', 'Hombros', 4, 8, null, 35],
    ['Elevaciones laterales', 'Hombros', 3, 15, null, 8],
    ['Curl de bíceps', 'Brazos', 3, 12, null, 14],
    ['Extensión de tríceps en polea', 'Brazos', 3, 12, null, 25],
    ['Plancha', 'Core', 3, 45, null, null],
    ['Abdominales en polea', 'Core', 3, 15, null, 30],
  ].map(([name, category, sets, reps, youtube_url, suggested_weight], i) => ({ id: i + 1, name, category, sets, reps, youtube_url, suggested_weight, notes: i % 3 === 0 ? 'Controlar la bajada.' : null, variant_exercise_id: i === 0 ? 2 : null, variant_id: i === 0 ? 2 : null, variant_name: i === 0 ? 'Press inclinado con mancuernas' : null, variant_youtube_url: i === 0 ? 'https://youtu.be/8iPEnn-ltC8' : null, created_at: iso(-100), deleted_at: null }));
  exercises.push({ id: 90, name: 'Ejercicio viejo', category: 'Otros', sets: 3, reps: 10, youtube_url: null, suggested_weight: null, notes: null, variant_exercise_id: null, deleted_at: iso(-3) });

  const item = (n, sets, reps, extra = {}) => ({ id: exercises.find((e) => e.name === n)?.id, name: n, sets, reps, reps_unit: 'reps', ...extra });
  const plans = [
    { id: 1, title: 'Fuerza + hipertrofia · 4 días', description: 'Rutina dividida en 4 días para nivel intermedio.', category: 'training', created_at: iso(-90), updated_at: iso(-5), creator_name: 'Ulises', creator_surname: 'Figueroa',
      content_json: { general: { warmup: [{ name: 'Cinta suave', duration: '8 min' }], mobility: [], core: [], cardio: [], order: ['warmup', 'mobility', 'core', 'cardio'] },
        days: [
          { day: 1, name: 'Pecho y tríceps', sectionOrder: ['warmup', 'exercises', 'core', 'mobility', 'cardio'], exercises: [item('Press de banca', 4, 8, { rir: 1, suggested_weight: 60, variant: { id: 2, name: 'Press inclinado con mancuernas', youtube_url: 'https://youtu.be/8iPEnn-ltC8', sets: 3, reps: 10 } }), item('Aperturas en polea', 3, 12), item('Extensión de tríceps en polea', 3, 12, { notes: 'Codos pegados' })], warmup: [], mobility: [], core: [], cardio: [] },
          { day: 2, name: 'Piernas', exercises: [item('Sentadilla libre', 4, 8, { series_breakdown: [{ weight: 60, reps: 10, rir: 2 }, { weight: 70, reps: 8, rir: 1 }, { weight: 80, reps: 6, rir: 0 }] }), item('Peso muerto rumano', 3, 10), item('Plancha', 3, 45, { reps_unit: 'seconds' })], warmup: [], mobility: [], core: [], cardio: [] },
          { day: 3, name: 'Espalda y bíceps', exercises: [item('Dominadas', 4, 6), item('Remo con barra', 4, 8), item('Curl de bíceps', 3, 12, { superset: [{ name: 'Elevaciones laterales', sets: 3, reps: 15 }] })], warmup: [], mobility: [], core: [], cardio: [] },
        ] } },
    { id: 2, title: 'Definición · plan de comidas', description: 'Déficit moderado con alto aporte de proteínas.', category: 'nutrition', created_at: iso(-60), updated_at: iso(-60), content: 'Desayuno:\n- Avena con leche y frutas\n\nAlmuerzo:\n- Pollo con arroz y ensalada\n\nCena:\n- Tortilla de verduras' },
    { id: 3, title: 'Rutina clásica (formato de texto)', description: '', category: 'training', created_at: iso(-200), updated_at: iso(-200), content_json: null, content: 'Día 1 - Pecho:\n- Press banca 4x10 [RIR 1] - subir de a poco\n- Aperturas 3x12\nDía 2 - Piernas:\n- Sentadilla 4x8\n- Prensa 3x12' },
  ];

  const products = [
    { id: 1, name: 'Proteína whey 1 kg', price: 38500, category: 'suplementacion', description: 'Sabor vainilla, 30 porciones.', images: [], stock: 12, active: true },
    { id: 2, name: 'Remera dry-fit', price: 14900, category: 'ropa', description: 'Talles S a XL.', images: [], stock: 2, active: true },
    { id: 3, name: 'Guía de hipertrofia (ebook)', price: 6500, category: 'ebooks', description: null, images: [], stock: null, active: false },
  ];
  const payments = [];
  for (let i = 0; i < 26; i += 1) {
    const u = users[1 + (i % 18)];
    const store = i % 3 === 0;
    payments.push({ id: i + 1, user_id: u.id, name: u.name, surname: u.surname, email: u.email, plan_type: store ? null : 'Plan mensual', product_name: store ? products[i % 3].name : null, quantity: store ? 1 + (i % 2) : null, source: store ? 'store' : 'subscription', amount: store ? 14900 + i * 100 : 25000, currency: 'ARS', status: ['approved', 'approved', 'approved', 'pending', 'rejected', 'approved', 'cancelled'][i % 7], payment_method: 'visa', payment_type: 'credit_card', mp_payment_id: `1234${i}`, created_at: iso(-i * 2 - 0.2) });
  }

  return {
    users, exercises, plans, products, payments,
    storeEnabled: true,
    assignments: [{ user_id: 2, plan_id: 1, expires_at: null }, { user_id: 3, plan_id: 1, expires_at: iso(20) }, { user_id: 3, plan_id: 2, expires_at: null }],
    userExercises: { 2: [{ exercise_id: 1, name: 'Press de banca', weight: 60, reps: 8, updated_at: iso(-2) }, { exercise_id: 4, name: 'Sentadilla libre', weight: 90, reps: 6, updated_at: iso(-1) }] },
    notes: [{ id: 1, user_id: 3, author_id: 1, author_name: 'Ulises Figueroa', body: 'Lesión leve de hombro izquierdo: evitar press militar pesado.', pinned: true, created_at: iso(-20), updated_at: iso(-20) }],
    contacts: [
      { id: 1, name: 'Romina Páez', email: 'romina.paez@mail.com', topic: 'planes', message: 'Hola! Quería saber los precios de los planes y si tienen descuento por pagar varios meses juntos. Gracias!', created_at: iso(-1) },
      { id: 2, name: 'Diego Ferreyra', email: 'diego.f@mail.com', topic: 'rutina', message: 'Buenas, tengo una molestia en la rodilla derecha. Mi rutina actual tiene sentadillas pesadas, ¿la puedo cambiar por algo que no me duela?', created_at: iso(-3) },
      { id: 3, name: 'Luz Benítez', email: 'luzbenitez@mail.com', phone: '1150001234', topic: 'tienda', message: 'Compré la proteína la semana pasada y todavía no me llegó. ¿Me pueden confirmar el estado del pedido?', created_at: iso(-8) },
    ],
    audit: [
      { id: 1, admin_id: 1, admin_name: 'Ulises Figueroa', action: 'Editó un plan', entity_type: 'plan', entity_id: 1, entity_label: 'Fuerza + hipertrofia · 4 días', created_at: iso(-1) },
      { id: 2, admin_id: 1, admin_name: 'Ulises Figueroa', action: 'Cambió el vencimiento', entity_type: 'user', entity_id: 3, entity_label: 'Martín Gómez', created_at: iso(-2) },
      { id: 3, admin_id: null, admin_name: null, action: 'Renovación automática por pago', entity_type: 'user', entity_id: 4, entity_label: 'Camila Rossi', created_at: iso(-3) },
    ],
    // última actividad por alumno (id → días desde el último entrenamiento; null = nunca)
    lastWorkoutDays: { 2: 1, 3: 12, 4: null, 5: 3, 6: 20, 7: 0, 8: 9, 10: 2, 11: 30, 12: 4 },
    nextId: { user: 100, plan: 100, exercise: 200, product: 100, note: 100, contact: 100 },
  };
}

function createServer() {
  let db = seed();
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const ok = (res, extra = {}) => json(res, 200, { success: true, ...extra });
  const fail = (res, status, message, extra = {}) => json(res, status, { success: false, message, ...extra });
  const requests = [];

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch (_e) { body = {}; }
      const m = req.method;
      requests.push({ method: m, path: p, body });
      const authed = /^Bearer test-token$/.test(req.headers.authorization || '');
      const match = (re) => p.match(re);
      let r;

      if (p === '/api/health') return ok(res, { status: 'ok' });
      if (p === '/api/__reset' && m === 'POST') { db = seed(); requests.length = 0; return ok(res); }
      if (p === '/api/__requests') return json(res, 200, requests);
      if (p === '/api/__add-payment' && m === 'POST') { const u = db.users[3]; db.payments.unshift({ id: 999, user_id: u.id, name: u.name, surname: u.surname, email: u.email, plan_type: 'Rutina Personalizada (1 mes)', source: 'plan', amount: 30000, currency: 'ARS', status: 'approved', payment_method: 'visa', created_at: new Date().toISOString() }); return ok(res); }
      if (p === '/api/__add-user' && m === 'POST') { db.users.push({ id: 500, name: 'Nuevo', surname: 'Alumno', email: 'nuevo@mail.com', role: 'user', mobile_enabled: false, expires_at: null, created_at: new Date().toISOString() }); return ok(res); }
      if (p === '/api/__add-contact' && m === 'POST') { db.contacts.unshift({ id: db.nextId.contact++, name: 'Walter Sosa', email: 'walter.sosa@mail.com', topic: 'otro', message: 'Quisiera saber si dan clases los fines de semana.', created_at: new Date().toISOString() }); return ok(res); }
      if (p === '/api/auth/login' && m === 'POST') {
        if (body.password !== 'clave1234') return fail(res, 401, 'Email o contraseña incorrectos');
        const user = db.users.find((u) => u.email === body.email);
        if (!user) return fail(res, 401, 'Email o contraseña incorrectos');
        return ok(res, { token: 'test-token', user });
      }
      if (!authed) return fail(res, 401, 'No autorizado');
      if (p === '/api/auth/me') return ok(res, { user: db.users[0] });
      if (p === '/api/auth/logout') return ok(res);

      if (p === '/api/auth/register' && m === 'POST') {
        if (db.users.some((u) => u.email === body.email)) return fail(res, 409, 'Ese email ya está registrado', { field: 'email' });
        const user = { id: db.nextId.user++, role: 'user', mobile_enabled: false, expires_at: null, created_at: new Date().toISOString(), name: body.name, surname: body.surname, email: body.email, phone: body.phone, username: body.username, document_type: body.document_type };
        db.users.push(user);
        return json(res, 201, { success: true, user });
      }

      if (p === '/api/admin/stats') return ok(res, { totalUsers: db.users.length, activeUsers: 7, totalPlans: 0, activity: [] });
      if (p === '/api/admin/users' && m === 'GET') { const sorted = [...db.users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); const limit = Number(url.searchParams.get('limit') || 50); return ok(res, { users: sorted.slice(0, limit), pagination: { page: 1, pages: 1, total: db.users.length } }); }
      if ((r = match(/^\/api\/admin\/users\/(\d+)$/))) {
        const u = db.users.find((x) => x.id === Number(r[1]));
        if (!u) return fail(res, 404, 'Usuario no encontrado');
        if (m === 'GET') return ok(res, { user: u });
        if (m === 'PATCH') { Object.assign(u, body); return ok(res, { user: u }); }
        if (m === 'DELETE') { db.users = db.users.filter((x) => x !== u); return ok(res); }
      }
      if ((r = match(/^\/api\/admin\/users\/(\d+)\/mobile-access$/)) && m === 'PATCH') { const u = db.users.find((x) => x.id === Number(r[1])); u.mobile_enabled = Boolean(body.enabled); return ok(res, { user: u }); }
      if ((r = match(/^\/api\/admin\/users\/(\d+)\/expiration$/)) && m === 'PATCH') { const u = db.users.find((x) => x.id === Number(r[1])); u.expires_at = body.expiresAt ? `${body.expiresAt}T12:00:00.000Z` : null; return ok(res, { user: u }); }
      if ((r = match(/^\/api\/admin\/users\/(\d+)\/role$/)) && m === 'POST') { const u = db.users.find((x) => x.id === Number(r[1])); u.role = body.role; return ok(res, { user: u }); }
      if ((r = match(/^\/api\/admin\/users\/(\d+)\/exercises\/stats$/))) return ok(res, { stats: [] });
      if ((r = match(/^\/api\/admin\/users\/(\d+)\/exercises$/))) return ok(res, { exercises: db.userExercises[r[1]] || [] });
      if (match(/^\/api\/admin\/users\/\d+\/exercises\/[^/]+\/history$/)) return ok(res, { history: [] });
      if (match(/^\/api\/admin\/users\/\d+\/plans\/\d+\/progress$/)) return ok(res, { totalDays: 3, completedCount: 1, days: [{ day: 1, completedThisWeek: true }, { day: 2, completedThisWeek: false }, { day: 3, completedThisWeek: false }] });

      // Seguimiento, notas, historial y actividad
      if (p === '/api/admin/users/activity-summary') {
        return ok(res, { users: db.users.filter((u) => u.role !== 'admin').map((u) => {
          const days = db.lastWorkoutDays[u.id];
          const last = days === undefined || days === null ? null : iso(-days);
          return { user_id: u.id, last_login: last || (u.id % 2 ? iso(-25) : null), last_workout_at: last, workouts_7d: days !== undefined && days !== null && days < 7 ? 3 : 0, workouts_30d: last ? 9 : 0 };
        }) });
      }
      if ((r = match(/^\/api\/admin\/users\/(\d+)\/adherence$/))) {
        const count = Number(url.searchParams.get('weeks') || 8);
        const weeks = Array.from({ length: count }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - (count - 1 - i) * 7 - ((d.getDay() + 6) % 7));
          return { weekStart: d.toISOString().slice(0, 10), completed: [0, 1, 2, 3, 2, 3, 1, 2][i % 8] };
        });
        return ok(res, { weeks, plannedPerWeek: 3 });
      }
      if ((r = match(/^\/api\/admin\/users\/(\d+)\/notes$/))) {
        const userId = Number(r[1]);
        if (m === 'GET') return ok(res, { notes: db.notes.filter((n) => n.user_id === userId) });
        if (m === 'POST') {
          if (!String(body.body || '').trim()) return fail(res, 400, 'La nota no puede estar vacía');
          const note = { id: db.nextId.note++, user_id: userId, author_id: 1, author_name: 'Ulises Figueroa', body: String(body.body).trim(), pinned: Boolean(body.pinned), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          db.notes.push(note);
          return json(res, 201, { success: true, note });
        }
      }
      if ((r = match(/^\/api\/admin\/users\/(\d+)\/notes\/(\d+)$/))) {
        const note = db.notes.find((n) => n.id === Number(r[2]) && n.user_id === Number(r[1]));
        if (!note) return fail(res, 404, 'Nota no encontrada');
        if (m === 'PATCH') { if (body.body !== undefined) note.body = body.body; if (body.pinned !== undefined) note.pinned = Boolean(body.pinned); note.updated_at = new Date().toISOString(); return ok(res, { note }); }
        if (m === 'DELETE') { db.notes = db.notes.filter((n) => n !== note); return ok(res); }
      }
      if (p === '/api/admin/audit') {
        let items = db.audit;
        if (url.searchParams.get('entity_type')) items = items.filter((i) => i.entity_type === url.searchParams.get('entity_type'));
        if (url.searchParams.get('entity_id')) items = items.filter((i) => String(i.entity_id) === url.searchParams.get('entity_id'));
        return ok(res, { items });
      }
      if (p === '/api/admin/activity') return ok(res, { items: db.audit.map((i) => ({ type: 'admin', action: i.action, user: i.admin_name || 'Sistema', timestamp: i.created_at })) });
      if (p === '/api/admin/vencimientos') return ok(res, { count: 0, users: [] });

      // Mensajes de contacto
      if (p === '/api/contact' && m === 'GET') return ok(res, { count: db.contacts.length, contacts: [...db.contacts].sort((a, b) => b.id - a.id) });
      if (p === '/api/contact' && m === 'DELETE') {
        if (body.confirm !== 'VACIAR') return fail(res, 400, 'Falta confirmar la acción (confirm debe ser "VACIAR")');
        const count = db.contacts.length;
        db.contacts = [];
        return ok(res, { message: count > 0 ? `Se eliminaron ${count} mensajes` : 'No había mensajes para eliminar', count });
      }
      if ((r = match(/^\/api\/contact\/(\d+)$/)) && m === 'DELETE') { const before = db.contacts.length; db.contacts = db.contacts.filter((c) => c.id !== Number(r[1])); if (db.contacts.length === before) return fail(res, 404, 'Mensaje no encontrado'); return ok(res); }

      // Planes
      if (p === '/api/admin/plans' && m === 'GET') return ok(res, { plans: db.plans, pagination: { page: 1, pages: 1 } });
      if (p === '/api/admin/plans' && m === 'POST') {
        const plan = { id: db.nextId.plan++, ...body, content_json: body.category === 'nutrition' ? null : { days: body.days, general: { warmup: body.general_warmup, mobility: body.general_mobility, core: body.general_core, cardio: body.general_cardio, order: body.general_section_order } }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        db.plans.unshift(plan);
        return json(res, 201, { success: true, plan });
      }
      if ((r = match(/^\/api\/admin\/plans\/user\/(\d+)$/))) return ok(res, { plans: db.assignments.filter((a) => a.user_id === Number(r[1])).map((a) => ({ ...db.plans.find((pl) => pl.id === a.plan_id), plan_id: a.plan_id, expires_at: a.expires_at })) });
      if ((r = match(/^\/api\/admin\/plans\/assign\/(\d+)$/)) && m === 'POST') { db.assignments.push({ user_id: Number(r[1]), plan_id: Number(body.planId), expires_at: body.expiresAt || null }); return ok(res); }
      if ((r = match(/^\/api\/admin\/plans\/assign\/(\d+)\/(\d+)$/))) {
        if (m === 'DELETE') { db.assignments = db.assignments.filter((a) => !(a.user_id === Number(r[1]) && a.plan_id === Number(r[2]))); return ok(res); }
        if (m === 'PATCH') { const a = db.assignments.find((x) => x.user_id === Number(r[1]) && x.plan_id === Number(r[2])); if (a) a.expires_at = body.expiresAt || null; return ok(res); }
      }
      if ((r = match(/^\/api\/admin\/plans\/(\d+)\/assignees$/))) return ok(res, { users: db.assignments.filter((a) => a.plan_id === Number(r[1])).map((a) => db.users.find((u) => u.id === a.user_id)).filter(Boolean) });
      if ((r = match(/^\/api\/admin\/plans\/(\d+)\/assignment-count$/))) return ok(res, { count: db.assignments.filter((a) => a.plan_id === Number(r[1])).length });
      if ((r = match(/^\/api\/admin\/plans\/(\d+)\/duplicate$/)) && m === 'POST') { const src = db.plans.find((x) => x.id === Number(r[1])); const copy = { ...JSON.parse(JSON.stringify(src)), id: db.nextId.plan++, title: body.title }; db.plans.unshift(copy); return json(res, 201, { success: true, plan: copy }); }
      if ((r = match(/^\/api\/admin\/plans\/(\d+)$/))) {
        const plan = db.plans.find((x) => x.id === Number(r[1]));
        if (!plan) return fail(res, 404, 'Plan no encontrado');
        if (m === 'GET') return ok(res, { plan });
        if (m === 'PATCH') { Object.assign(plan, { title: body.title, description: body.description, content: body.content ?? plan.content, updated_at: new Date().toISOString() }); if (body.days) plan.content_json = { days: body.days, general: { warmup: body.general_warmup, mobility: body.general_mobility, core: body.general_core, cardio: body.general_cardio, order: body.general_section_order } }; return ok(res, { plan }); }
        if (m === 'DELETE') { db.plans = db.plans.filter((x) => x !== plan); return ok(res); }
      }

      // Catálogo
      if (p === '/api/admin/exercises/trash') return ok(res, { exercises: db.exercises.filter((e) => e.deleted_at) });
      if (p === '/api/admin/exercises' && m === 'GET') return ok(res, { exercises: db.exercises.filter((e) => !e.deleted_at), pagination: { total: db.exercises.length } });
      if (p === '/api/admin/exercises' && m === 'POST') { if (!body.name) return fail(res, 400, 'El nombre del ejercicio es obligatorio'); const ex = { id: db.nextId.exercise++, ...body, deleted_at: null }; db.exercises.push(ex); return json(res, 201, { success: true, exercise: ex }); }
      if ((r = match(/^\/api\/admin\/exercises\/(\d+)\/restore$/))) { const ex = db.exercises.find((x) => x.id === Number(r[1])); ex.deleted_at = null; return ok(res, { exercise: ex }); }
      if ((r = match(/^\/api\/admin\/exercises\/(\d+)$/))) {
        const ex = db.exercises.find((x) => x.id === Number(r[1]));
        if (!ex) return fail(res, 404, 'Ejercicio no encontrado');
        if (m === 'PATCH') { Object.assign(ex, body); return ok(res, { exercise: ex }); }
        if (m === 'DELETE') { ex.deleted_at = new Date().toISOString(); return ok(res); }
      }

      // Tienda y pagos
      if (p === '/api/admin/store/settings') { if (m === 'PATCH') db.storeEnabled = Boolean(body.enabled); return ok(res, { enabled: db.storeEnabled }); }
      if (p === '/api/admin/store/products' && m === 'GET') return ok(res, { products: db.products });
      if (p === '/api/admin/store/products' && m === 'POST') { const pr = { id: db.nextId.product++, ...body }; db.products.push(pr); return json(res, 201, { success: true, product: pr }); }
      if ((r = match(/^\/api\/admin\/store\/products\/(\d+)\/active$/))) { const pr = db.products.find((x) => x.id === Number(r[1])); pr.active = Boolean(body.active); return ok(res, { product: pr }); }
      if ((r = match(/^\/api\/admin\/store\/products\/(\d+)$/))) {
        const pr = db.products.find((x) => x.id === Number(r[1]));
        if (m === 'PATCH') { Object.assign(pr, body); return ok(res, { product: pr }); }
        if (m === 'DELETE') { if (db.payments.some((x) => x.product_name === pr.name)) return fail(res, 409, 'Este producto ya tiene pedidos asociados. Desactivalo en vez de eliminarlo.'); db.products = db.products.filter((x) => x !== pr); return ok(res); }
      }
      if (p === '/api/admin/store/orders') return ok(res, { orders: db.payments.filter((x) => x.source === 'store') });
      if (p === '/api/payments/all') return ok(res, { payments: db.payments });

      return fail(res, 404, `Ruta no implementada en el mock: ${m} ${p}`);
    });
  });
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT || 4010);
  createServer().listen(port, '127.0.0.1', () => console.log(`Mock del backend en http://127.0.0.1:${port}  (admin@test.com / clave1234)`));
}
