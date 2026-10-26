// Uso:  node migrar.mjs ruta/a/data.service.ts
// Genera:
//   out/02_seed.sql
//   out/reporte_problemas.csv
//   out/costos_iniciales.csv

import fs from 'node:fs';

const SRC = process.argv[2] ?? 'src/app/services/data.service.ts';

fs.mkdirSync('out', { recursive: true });


// ============================================================
// 1. EQUIVALENCIAS DE NOMBRES
// ============================================================

const ALIAS = {
  'naranja fruta': 'Naranja',
  'manzanas verde': 'Manzana verde',
  'manzana verde': 'Manzana verde',

  'stevia liquida': 'Stevia líquida',
  'stevia líquida': 'Stevia líquida',

  // Fusiones
  'agua tratada': 'Agua',
  'azúcar granulada': 'Azúcar',
  'limón sutil': 'Limón',
};


// Tolerancias para validaciones
const TOL_REL = 0.03;
const TOL_ABS = 0.003;


// ============================================================
// 2. LEER DATA.SERVICE.TS
// ============================================================

const src = fs
  .readFileSync(SRC, 'utf8')
  .replace(/\/\/.*$/gm, '');


function extraer(nombre) {
  const i = src.indexOf(`${nombre} = signal<`);

  if (i < 0) {
    throw new Error(`No encontré ${nombre}`);
  }

  const start = src.indexOf(
    '[',
    src.indexOf('>(', i) + 2
  );

  let depth = 0;
  let q = null;

  for (let j = start; j < src.length; j++) {
    const c = src[j];

    if (q) {
      if (c === q && src[j - 1] !== '\\') {
        q = null;
      }

      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      q = c;
      continue;
    }

    if (c === '[') {
      depth++;
    }

    if (c === ']' && --depth === 0) {
      return new Function(
        'return ' + src.slice(start, j + 1)
      )();
    }
  }

  throw new Error(`Array ${nombre} sin cerrar`);
}


const mps = extraer('materiasPrimas');
const productos = extraer('productos');
const empaques = extraer('empaques');


// ============================================================
// 3. CATÁLOGO CANÓNICO
// ============================================================

const problemas = [];

const warn = (tipo, producto, detalle) => {
  problemas.push({
    tipo,
    producto,
    detalle
  });
};


const catKey = new Map();

for (const m of mps) {
  catKey.set(
    m.nombre.trim().toLowerCase(),
    m.nombre.trim()
  );
}


const canon = (n) => {
  const k = n.trim().toLowerCase();

  return ALIAS[k] ??
    catKey.get(k) ??
    n.trim();
};


const catalogo = new Map();

for (const m of mps) {
  const n = canon(m.nombre);

  const prev = catalogo.get(n);

  if (
    prev &&
    Math.abs(prev.costoKg - m.costoKg) > 1e-9
  ) {
    warn(
      'MP_COSTO_CONFLICTO',
      '',
      `${m.nombre} -> ${n}: ${prev.costoKg} vs ${m.costoKg} (se conserva el primero)`
    );
  }

  if (!prev) {
    catalogo.set(n, {
      unidad: m.unidad,
      costoKg: m.costoKg
    });
  }
}


// ============================================================
// 4. CONSOLIDAR PRODUCTOS Y PRESENTACIONES
// ============================================================

const num = (x) => Number(x) || 0;


const parseFecha = (s) => {
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(
    (s ?? '').trim()
  );

  return m
    ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    : null;
};


const usadas = new Set();

const limpios = [];


for (const p of productos) {

  // ----------------------------------------------------------
  // Fórmula
  // ----------------------------------------------------------

  const formula = new Map();

  for (const ing of p.ingredientes) {

    const n = canon(ing.nombre);

    formula.set(
      n,
      (formula.get(n) ?? 0) +
      num(ing.porcentaje)
    );
  }


  const sumPct = [...formula.values()]
    .reduce((a, b) => a + b, 0);


  if (Math.abs(sumPct - 100) > 0.5) {

    warn(
      'FORMULA_NO_SUMA_100',
      p.id,
      `suma = ${sumPct.toFixed(3)}`
    );
  }


  // ----------------------------------------------------------
  // Presentaciones
  // ----------------------------------------------------------

  const pres = new Map();


  for (const pr of p.presentaciones) {

    const key = Number(pr.litros).toFixed(3);

    if (pres.has(key)) {

      warn(
        'PRESENTACION_DUPLICADA',
        p.id,
        `${key} L repetida`
      );
    }


    const items = new Map();


    for (const it of pr.items) {

      const n = canon(it.ingrediente);

      const a =
        items.get(n) ??
        {
          kg: 0,
          litros: 0,
          costo: 0
        };


      a.kg += num(it.kg);

      a.litros += num(it.litros);

      a.costo += num(it.costo);

      items.set(n, a);
    }


    // --------------------------------------------------------
    // Validaciones
    // --------------------------------------------------------

    const sKg = [...items.values()]
      .reduce((s, x) => s + x.kg, 0);


    const sL = [...items.values()]
      .reduce((s, x) => s + x.litros, 0);


    const sC = [...items.values()]
      .reduce((s, x) => s + x.costo, 0);


    const near = (a, b) =>
      Math.abs(a - b) <=
      Math.max(
        TOL_ABS,
        TOL_REL * Math.abs(b)
      );


    if (!near(sKg, pr.totalKg)) {

      warn(
        'TOTAL_KG',
        p.id,
        `${key} L: items=${sKg.toFixed(4)} vs total=${pr.totalKg}`
      );
    }


    if (!near(sL, pr.totalLitros)) {

      warn(
        'TOTAL_LITROS',
        p.id,
        `${key} L: items=${sL.toFixed(4)} vs total=${pr.totalLitros}`
      );
    }


    if (!near(sC, pr.totalCosto)) {

      warn(
        'TOTAL_COSTO',
        p.id,
        `${key} L: items=${sC.toFixed(4)} vs total=${pr.totalCosto}`
      );
    }


    if (!near(Number(key), pr.totalLitros)) {

      warn(
        'LITROS_VS_TOTAL',
        p.id,
        `presentación ${key} L pero totalLitros=${pr.totalLitros}`
      );
    }


    // --------------------------------------------------------
    // Validar costo real de cada materia prima
    // --------------------------------------------------------

    for (const [n, x] of items) {

      const mp = catalogo.get(n);

      if (!mp) {

        warn(
          'MP_NO_EXISTE',
          p.id,
          n
        );

        continue;
      }


      const calc =
        x.kg * mp.costoKg;


      if (
        Math.abs(calc - x.costo) >
        Math.max(
          0.005,
          0.05 * calc
        )
      ) {

        warn(
          'COSTO_ITEM',
          p.id,
          `${key} L ${n}: kg*costo=${calc.toFixed(4)} vs costo=${x.costo}`
        );
      }
    }


    pres.set(
      key,
      {
        litros: Number(key),
        items
      }
    );
  }


  // ----------------------------------------------------------
  // Materias primas utilizadas
  // ----------------------------------------------------------

  for (const n of formula.keys()) {

    if (!catalogo.has(n)) {

      warn(
        'MP_NO_EXISTE',
        p.id,
        n
      );
    }
  }


  [...formula.keys()]
    .forEach((n) => usadas.add(n));


  pres.forEach((v) =>
    v.items.forEach(
      (_, n) => usadas.add(n)
    )
  );


  limpios.push({
    ...p,
    fecha: parseFecha(p.fechaRevision),
    formula,
    pres
  });
}


// ============================================================
// 5. MATERIAS PRIMAS FALTANTES
// ============================================================

// Las MPs que aparecen en productos pero no existen
// en el catálogo se agregan con costo 0.

for (const n of usadas) {

  if (!catalogo.has(n)) {

    catalogo.set(
      n,
      {
        unidad: 'Kg',
        costoKg: 0
      }
    );
  }
}


const sinUso = [...catalogo.keys()]
  .filter((n) => !usadas.has(n));


if (sinUso.length) {

  warn(
    'MP_SIN_USO',
    '',
    sinUso.join(' | ')
  );
}


// ============================================================
// 6. EMPAQUES
// ============================================================
//
// Botella
// Tap
// Etiqueta
//
// Si un empaque no tiene costo o su costo es null,
// vacío o undefined, se guarda como 0.
//
// Ya NO se convierte a NULL.
// ============================================================

const empPorProd = new Map();


for (const e of empaques) {

  if (!empPorProd.has(e.productoId)) {
    empPorProd.set(e.productoId, []);
  }

  empPorProd
    .get(e.productoId)
    .push(e);
}


const empFinal = [];


for (const [pid, lista] of empPorProd) {

  for (const e of lista) {

    empFinal.push({
      pid,
      tipo: e.tipo,
      costo: num(e.costo)
    });
  }
}


// ============================================================
// 7. GENERAR SQL
// ============================================================

const q = (s) =>
  `'${String(s).replace(/'/g, "''")}'`;


const mpId = (n) =>
  `(select id from materia_prima where nombre = ${q(n)})`;


const sql = [
  '-- 02_seed.sql (generado por migrar.mjs)',
  'begin;'
];


// ------------------------------------------------------------
// Materias primas
// ------------------------------------------------------------

sql.push(
  'insert into materia_prima (nombre, unidad, costo_kg) values'
);


sql.push(
  [...catalogo]
    .map(
      ([n, m]) =>
        `  (${q(n)}, ${q(m.unidad)}, ${m.costoKg})`
    )
    .join(',\n') +
  ';'
);


// ------------------------------------------------------------
// Productos
// ------------------------------------------------------------

sql.push(
  'insert into producto (id, nombre, categoria, fecha_revision) values'
);


sql.push(
  limpios
    .map(
      (p) =>
        `  (${q(p.id)}, ${q(p.nombre)}, ${q(p.categoria)}, ${p.fecha ? q(p.fecha) : 'null'})`
    )
    .join(',\n') +
  ';'
);


// ------------------------------------------------------------
// Fórmulas y presentaciones
// ------------------------------------------------------------

for (const p of limpios) {

  for (const [n, pct] of p.formula) {

    sql.push(
      `insert into formula_ingrediente values (${q(p.id)}, ${mpId(n)}, ${pct.toFixed(4)});`
    );
  }


  for (const [key, pr] of p.pres) {

    sql.push(
      `insert into presentacion (producto_id, litros) values (${q(p.id)}, ${key});`
    );


    const pid =
      `(select id from presentacion where producto_id = ${q(p.id)} and litros = ${key})`;


    for (const [n, x] of pr.items) {

      sql.push(
        `insert into presentacion_item values (${pid}, ${mpId(n)}, ${x.kg.toFixed(5)}, ${x.litros.toFixed(5)}, ${x.costo.toFixed(5)});`
      );
    }
  }
}


// ------------------------------------------------------------
// EMPAQUES
// ------------------------------------------------------------

sql.push(
  'insert into empaque (producto_id, tipo, costo) values'
);


sql.push(
  empFinal
    .map(
      (e) =>
        `  (${q(e.pid)}, ${q(e.tipo)}, ${e.costo})`
    )
    .join(',\n') +
  ';'
);


sql.push('commit;');


// Guardar SQL

fs.writeFileSync(
  'out/02_seed.sql',
  sql.join('\n') + '\n'
);


// ============================================================
// 8. REPORTE DE PROBLEMAS
// ============================================================

const csv = (rows, cols) => [
  cols.join(','),
  ...rows.map((r) =>
    cols
      .map(
        (c) =>
          `"${String(r[c] ?? '')
            .replace(/"/g, '""')}"`
      )
      .join(',')
  )
].join('\n');


fs.writeFileSync(
  'out/reporte_problemas.csv',
  csv(
    problemas,
    [
      'tipo',
      'producto',
      'detalle'
    ]
  )
);


// ============================================================
// 9. COSTOS INICIALES
// ============================================================

const costos = [];


for (const p of limpios) {

  const emp =
    (empPorProd.get(p.id) ?? [])
      .reduce(
        (s, e) => s + num(e.costo),
        0
      );


  for (const [key, pr] of p.pres) {

    let mat = 0;

    let orig = 0;


    for (const [n, x] of pr.items) {

      mat +=
        x.kg *
        (catalogo.get(n)?.costoKg ?? 0);

      orig += x.costo;
    }


    costos.push({

      producto: p.nombre,

      litros: key,

      costo_materia:
        mat.toFixed(4),

      costo_materia_original:
        orig.toFixed(4),

      costo_empaque:
        emp.toFixed(4),

      costo_total:
        (mat + emp).toFixed(4)
    });
  }
}


if (costos.length) {

  fs.writeFileSync(
    'out/costos_iniciales.csv',
    csv(
      costos,
      Object.keys(costos[0])
    )
  );
}


// ============================================================
// 10. RESUMEN
// ============================================================

const resumen =
  problemas.reduce(
    (a, p) => {
      a[p.tipo] =
        (a[p.tipo] ?? 0) + 1;

      return a;
    },
    {}
  );


console.log(
  `MPs: ${catalogo.size} | ` +
  `Productos: ${limpios.length} | ` +
  `Presentaciones: ${costos.length} | ` +
  `Empaques: ${empFinal.length}`
);


console.log(
  'Problemas por tipo:',
  resumen
);


console.log(
  'Archivos en ./out'
);
