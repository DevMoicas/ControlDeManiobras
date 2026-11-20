// Escena decorativa del inicio: un tractocamión con un contenedor de 40' que
// avanza por el muelle mientras el fondo pasa, alternando mar abierto con
// buques y un puerto con grúas, estibas y más tractos. Para que se lea en
// profundidad: dos capas a distinta velocidad (horizonte lento, plano medio más
// rápido), perspectiva atmosférica, el patio con juntas en fuga y la sombra del
// tracto en el muelle. Solo adorno (aria-hidden); animaciones en App.css,
// bloque "INICIO".
import logoFraba from '../../pages/Logo Fraba.png';

// Full (usuario, 2026-11-19): tracto + dos remolques con contenedor, unidos
// por un convertidor (dolly). Ejes: remolque trasero, dolly, remolque
// delantero, tracción del tracto y dirección.
const LLANTAS = [144, 168, 260, 284, 322, 346, 426, 450, 524];

// Remolque con contenedor, en volumen: el contenedor con su cara de arriba y la
// delantera, y la plataforma con su propio grosor, cara de arriba y vigas, para
// que el contenedor se vea apoyado y no flotando. Caras en fuga +8, -7.
function Remolque({ x, largo, plataforma }) {
  const fin = x + largo;
  const [p0, p1] = plataforma;
  return (
    <>
      {/* Plataforma: cara de arriba (asoma detrás del contenedor), frente y canto */}
      <path d={`M${p0} 154 L${p0 + 8} 147 H${p1 + 8} L${p1} 154 Z`} fill="#2a4a68" />
      <rect x={p0} y="154" width={p1 - p0} height="7" fill="#102a43" />
      <path d={`M${p1} 154 L${p1 + 8} 147 V154 L${p1} 161 Z`} fill="#0a1b2c" />
      <rect x={p0 + 4} y="161" width={p1 - p0 - 8} height="3" fill="#0a1b2c" />
      {/* Contenedor */}
      <path d={`M${x} 104 L${x + 8} 97 H${fin + 8} L${fin} 104 Z`} fill="#e25a52" />
      <path d={`M${fin} 104 L${fin + 8} 97 V147 L${fin} 154 Z`} fill="#9e1f1f" />
      <rect x={x} y="104" width={largo} height="50" rx="2" fill="#c62828" />
      <rect x={x} y="104" width={largo} height="50" rx="2" fill="url(#ie-nervios)" />
      <rect x={x} y="104" width={largo} height="50" rx="2" fill="url(#ie-volumen)" />
      <rect x={x} y="104" width={largo} height="50" rx="2" fill="none" stroke="#8e1b1b" strokeWidth="2" />
      {/* Esquineros donde el contenedor asienta en la plataforma */}
      <rect x={x} y="150" width="6" height="4" fill="#5c1010" />
      <rect x={fin - 6} y="150" width="6" height="4" fill="#5c1010" />
    </>
  );
}

const MAR = 760;      // ancho de cada fondo (mar y puerto); el bucle mide el doble
const HORIZONTE = 100;
const ORILLA = 118;   // donde empieza el plano medio (mar cercano o patio)
const MUELLE = 222;   // el borde del muelle por el que va el tracto
const SUELO = 198;    // donde apoyan grúas y estibas del puerto

// Bloques de contenedores repartidos por todo el patio, como en un puerto real
// (usuario, 2026-11-19): [x, base, alturas de cada columna]. La base dice a qué
// profundidad está: cuanto más arriba (más lejos), más chico. Huecos y alturas
// irregulares a propósito.
const BLOQUES = [
  // fondo del patio
  [800, 138, [2, 3, 1, 2]], [880, 140, [2, 1, 3]], [1000, 136, [3, 2, 3]], [1060, 141, [1, 3, 2, 2]],
  [1150, 137, [2, 2]], [1236, 139, [1, 2, 2, 3, 1]], [1340, 140, [3, 1, 2]], [1420, 137, [2, 1, 3]],
  [1470, 141, [1, 2]],
  // medio
  [846, 164, [3, 1, 4, 2]], [970, 167, [2, 3, 1]], [1124, 166, [2, 4, 3, 1]], [1240, 168, [3, 1, 2, 4]],
  [1338, 162, [4, 2, 3]], [1420, 165, [1, 3]],
  // cerca
  [784, 190, [5, 3]], [860, 193, [4, 2, 3]], [1060, 191, [3, 2]], [1180, 192, [3, 5, 2, 4]],
  [1310, 194, [2, 4]], [1436, 189, [2, 6, 3]],
];
const COLORES = ['#087e8b', '#c9584b', '#30b8b1', '#5f8f99', '#f5c84c', '#102a43'];

function Bloques() {
  return BLOQUES.map(([x, base, alturas], i) => {
    const k = 0.5 + ((base - 136) / 56) * 0.45;   // 0.5 al fondo, ~0.95 cerca
    return (
      <g key={`${x}-${base}`} transform={`translate(${x} ${base}) scale(${k.toFixed(3)})`}>
        <ellipse cx={alturas.length * 14.5} cy="2" rx={alturas.length * 17} ry="3" fill="#102a43" opacity="0.12" />
        {alturas.map((n, c) => Array.from({ length: n }, (_, j) => (
          <Contenedor key={`${c}-${j}`} x={c * 29} y={-13 * (j + 1)} w={28} h={12}
            color={COLORES[(i * 5 + c * 2 + j * 3) % COLORES.length]} />
        )))}
      </g>
    );
  });
}

// Contenedor en volumen (usuario, 2026-11-19): frente, cara de arriba aclarada
// y canto derecho en sombra, con la fuga de la escena. En las columnas cada
// uno tapa el canto del de su izquierda y la cara de arriba del de abajo, como
// en una estiba real, porque se pintan de izquierda a derecha y de abajo arriba.
function Contenedor({ x, y, w, h, color }) {
  const dx = h * 0.45;
  const dy = h * 0.38;
  const arriba = `M${x} ${y} L${x + dx} ${y - dy} H${x + w + dx} L${x + w} ${y} Z`;
  const canto = `M${x + w} ${y} L${x + w + dx} ${y - dy} V${y + h - dy} L${x + w} ${y + h} Z`;
  return (
    <>
      <path d={arriba} fill={color} />
      <path d={arriba} fill="#ffffff" opacity="0.32" />
      <path d={canto} fill={color} />
      <path d={canto} fill="#000000" opacity="0.3" />
      <rect x={x} y={y} width={w} height={h} fill={color} />
      <rect x={x} y={y} width={w} height={h} fill="url(#ie-nervios)" />
      <rect x={x} y={y} width={w} height={h} fill="url(#ie-volumen)" />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#000000" strokeOpacity="0.18" strokeWidth="0.8" />
    </>
  );
}

// Carga de los buques: [x, y, color], 20×10. Fila de abajo y luego la de
// arriba, de izquierda a derecha, para que cada caja tape las caras ocultas.
const BUQUE_CARGA = [
  [22, -20, '#c9584b'], [44, -20, '#087e8b'], [66, -20, '#f5c84c'],
  [88, -20, '#30b8b1'], [110, -20, '#c9584b'], [132, -20, '#5f8f99'], [154, -20, '#087e8b'],
  [44, -30, '#30b8b1'], [66, -30, '#c9584b'], [110, -30, '#087e8b'], [132, -30, '#f5c84c'],
];

// Chimenea de escape del tracto, como tubo: cuerpo con brillo de cromo y la
// boca elíptica arriba (usuario, 2026-11-19: una por cada lado, en 3D).
function Chimenea({ x, y }) {
  return (
    <>
      <rect x={x} y={y} width="5" height="30" fill="url(#ie-cromo)" />
      <ellipse cx={x + 2.5} cy={y + 30} rx="2.5" ry="1" fill="#4f6a73" />
      <ellipse cx={x + 2.5} cy={y} rx="2.5" ry="1.1" fill="#2c3e47" stroke="#8fa3ab" strokeWidth="0.5" />
    </>
  );
}

// Caja en volumen: frente, cara de arriba y canto derecho, con la fuga de la
// escena (+dx, -dy). La usan las grúas.
function Caja({ x, y, w, h, frente, arriba, canto, d = [8, 7] }) {
  const [dx, dy] = d;
  return (
    <>
      <path d={`M${x} ${y} L${x + dx} ${y - dy} H${x + w + dx} L${x + w} ${y} Z`} fill={arriba} />
      <path d={`M${x + w} ${y} L${x + w + dx} ${y - dy} V${y + h - dy} L${x + w} ${y + h} Z`} fill={canto} />
      <rect x={x} y={y} width={w} height={h} fill={frente} />
    </>
  );
}

// Grúa de pórtico de muelle en volumen (usuario, 2026-11-19): dos marcos, el de
// atrás desplazado y más oscuro, unidos por vigas con cara de arriba y canto;
// pluma de cajón hacia el mar, cabina de máquinas y carro con el spreader.
// Patas apoyadas en SUELO.
// Naranja de grúa portuaria (usuario, 2026-11-19).
const G = { frente: '#e8792b', arriba: '#f4a261', canto: '#b85a18', atras: '#a9541a' };

function Grua({ x }) {
  return (
    <g transform={`translate(${x} ${SUELO})`}>
      <ellipse cx="32" cy="1" rx="52" ry="4" fill="#102a43" opacity="0.16" />
      {/* Marco de atrás */}
      <g fill={G.atras}>
        <rect x="12" y="-118" width="5" height="110" />
        <rect x="62" y="-118" width="5" height="110" />
      </g>
      <path d="M14 -78 H64 M14 -116 L64 -80" stroke={G.atras} strokeWidth="2.5" fill="none" />
      {/* Vigas de pie que unen los dos marcos */}
      <path d="M2 0 L14 -8 M52 0 L64 -8" stroke={G.canto} strokeWidth="3" />
      {/* Marco de delante */}
      <g fill={G.frente}>
        <rect x="0" y="-110" width="5" height="110" />
        <rect x="50" y="-110" width="5" height="110" />
      </g>
      <path d="M3 -70 H52 M3 -108 L52 -72 M52 -108 L3 -72" stroke={G.frente} strokeWidth="2.5" fill="none" />
      {/* Viga del pórtico */}
      <Caja x={0} y={-116} w={55} h={8} d={[12, 8]} frente={G.frente} arriba={G.arriba} canto={G.canto} />
      {/* Tirantes en A, el de atrás más tenue */}
      <path d="M-88 -126 L32 -156 L94 -126 M32 -156 V-126" stroke={G.atras} strokeWidth="1.8" fill="none" transform="translate(10 -8)" />
      <path d="M-88 -126 L32 -156 L94 -126 M32 -156 V-126" stroke={G.frente} strokeWidth="2" fill="none" />
      {/* Pluma de cajón */}
      <Caja x={-92} y={-128} w={186} h={7} d={[10, 7]} frente={G.frente} arriba={G.arriba} canto={G.canto} />
      {/* Cabina de máquinas sobre la pluma */}
      <Caja x={34} y={-141} w={26} h={13} d={[8, 6]} frente="#f4f7f8" arriba="#ffffff" canto="#c9d6db" />
      <rect x="38" y="-137" width="10" height="4" fill="#102a43" />
      {/* Carro, cable y spreader */}
      <Caja x={-58} y={-121} w={14} h={5} d={[5, 4]} frente="#102a43" arriba="#2a4a68" canto="#0a1b2c" />
      <path d="M-54 -116 V-86 M-48 -116 V-86" stroke="#102a43" strokeWidth="1" />
      <Caja x={-66} y={-86} w={30} h={5} d={[5, 4]} frente="#f5c84c" arriba="#f8da7f" canto="#c99a1f" />
    </g>
  );
}

// Tracto estacionado en el patio, más cerca que la estiba (va delante).
function TractoMini({ x, color }) {
  const y = 214;
  return (
    <g transform={`translate(${x} ${y}) scale(1.15) translate(${-x} ${-y})`}>
      <ellipse cx={x + 46} cy={y + 1} rx="52" ry="3" fill="#102a43" opacity="0.16" />
      <Contenedor x={x} y={y - 26} w={70} h={18} color={color} />
      <rect x={x - 2} y={y - 8} width={96} height={3} fill="#102a43" />
      <path d={`M${x + 72} ${y - 5} V${y - 22} H${x + 84} L${x + 92} ${y - 12} V${y - 5} Z`} fill="#f4f7f8" stroke="#102a43" strokeWidth="1.2" />
      {[x + 10, x + 56, x + 86].map((cx) => <circle key={cx} cx={cx} cy={y - 2} r="4" fill="#102a43" />)}
    </g>
  );
}

// Horizonte (capa lenta): costa lejana y buques chicos, 1520 de largo.
function Lejos() {
  return (
    <>
      <path d="M0 100 Q70 84 140 95 T300 90 T460 97 T620 88 T780 96 T940 86 T1100 95 T1260 89 T1420 96 L1520 100 Z" fill="#cfe2e2" opacity="0.8" />
      <rect x="0" y={HORIZONTE} width={MAR * 2} height={ORILLA - HORIZONTE} fill="#cdebe9" />
      {[[110, 0.24], [470, 0.3], [690, 0.2], [930, 0.28], [1280, 0.22]].map(([x, k]) => (
        <use key={x} href="#ie-buque" transform={`translate(${x} ${HORIZONTE + 6}) scale(${k})`} opacity="0.4" />
      ))}
    </>
  );
}

// Plano medio (capa rápida): mar abierto (0–760) y luego el puerto (760–1520).
// El patio se funde con el mar en sus dos bordes (máscara), así el cambio de
// un fondo a otro es gradual y no un corte.
function Cerca() {
  const fuga = MAR + 380;   // punto de fuga de las juntas del patio
  return (
    <>
      <rect x="0" y={ORILLA} width={MAR * 2} height={MUELLE - ORILLA} fill="url(#ie-mar)" />
      {/* Mar: buques más grandes cuanto más cerca (más abajo) */}
      <use href="#ie-buque" transform="translate(60 134) scale(0.55)" opacity="0.7" />
      <use href="#ie-buque" transform="translate(560 140) scale(0.6)" opacity="0.75" />
      <use href="#ie-buque" transform="translate(300 152) scale(0.85)" opacity="0.9" />
      <use href="#ie-buque" transform="translate(16 190) scale(0.75)" />
      <g fill="none" stroke="#ffffff" strokeLinecap="round" opacity="0.85">
        <path d="M40 126 q4 -3 8 0 t8 0 M520 124 q4 -3 8 0 t8 0 M420 130 q4 -3 8 0 t8 0" strokeWidth="1.2" />
        <path d="M180 150 q6 -4 12 0 t12 0 M680 156 q6 -4 12 0 t12 0" strokeWidth="1.8" />
        <path d="M120 178 q9 -5 18 0 t18 0 M620 196 q9 -5 18 0 t18 0 M240 206 q9 -5 18 0 t18 0" strokeWidth="2.4" />
      </g>
      <g fill="none" stroke="#102a43" strokeWidth="1.6" strokeLinecap="round" opacity="0.35">
        <path d="M520 40 q4 -4 8 0 q4 -4 8 0 M548 54 q3 -3 6 0 q3 -3 6 0
                 M120 34 q4 -4 8 0 q4 -4 8 0 M146 48 q3 -3 6 0 q3 -3 6 0
                 M300 22 q5 -5 10 0 q5 -5 10 0 M650 28 q3 -3 6 0 q3 -3 6 0
                 M420 46 q3 -3 6 0 q3 -3 6 0 M690 58 q4 -4 8 0 q4 -4 8 0" />
      </g>

      {/* Puerto: buque atracado y el patio en tierra firme */}
      <use href="#ie-buque" transform={`translate(${MAR + 150} ${ORILLA}) scale(0.85)`} opacity="0.9" />
      <g mask="url(#ie-fundido)">
        <rect x={MAR} y={ORILLA} width={MAR} height={MUELLE - ORILLA} fill="url(#ie-tierra)" />
        <g stroke="#d3dde0" strokeWidth="1.2">
          {[-700, -480, -300, -150, 0, 150, 300, 480, 700].map((dx) => (
            <path key={dx} d={`M${fuga + dx * 0.12} ${ORILLA} L${fuga + dx} ${MUELLE}`} />
          ))}
          {[124, 133, 146, 164, 190].map((y) => <path key={y} d={`M${MAR} ${y} H${MAR * 2}`} />)}
        </g>
        {/* Dentro de la máscara: en los bordes se funden con el mar junto con el patio */}
        <Bloques />
      </g>
      <Grua x={MAR + 180} />
      <Grua x={MAR + 300} />
      <TractoMini x={MAR + 215} color="#087e8b" />
      <TractoMini x={MAR + 430} color="#c9584b" />
    </>
  );
}

// Sol o luna en una de tres posiciones fijas según la hora local del usuario
// (usuario, 2026-11-19):
//   sol:  6:00–11:59 saliendo (izq.) · 12:00–17:59 arriba · 18:00–19:59 atardecer (der.)
//   luna: 20:00–22:59 saliendo (izq.) · 23:00–3:59 arriba · 4:00–5:59 ocultándose (der.)
// El cielo cerca del horizonte se tiñe: durazno al amanecer y al atardecer,
// azulado de noche.
const POSICIONES = { izquierda: 0.15, centro: 0.5, derecha: 0.85 };

function cielo(fecha) {
  const h = fecha.getHours();
  const esDia = h >= 6 && h < 20;
  const lugar = esDia
    ? (h < 12 ? 'izquierda' : h < 18 ? 'centro' : 'derecha')
    : (h >= 20 && h < 23 ? 'izquierda' : (h >= 23 || h < 4) ? 'centro' : 'derecha');
  const t = POSICIONES[lugar];
  const x = 40 + t * 680;
  // Más alto que antes (usuario, 2026-11-19); en el centro no pasa de y≈22
  // para que el halo no se corte con el borde de la escena.
  const y = HORIZONTE - 10 - Math.sin(Math.PI * t) * 68;
  const tinte = !esDia ? '#c9d4ec' : lugar !== 'centro' ? '#f9dcbf' : '#e6f5f4';
  return { esDia, x, y, tinte };
}

export default function InicioEscena({ ahora }) {
  const astro = cielo(ahora ?? new Date());
  return (
    <svg className="inicio-escena" viewBox="0 0 760 260" aria-hidden="true" focusable="false">
      <defs>
        {/* Nervaduras de los contenedores: solo las rayas; el color de cada uno va
            en su propio rect (currentColor en un patrón se toma de <defs>, no
            de quien lo usa, y salían todos negros). */}
        <pattern id="ie-nervios" width="7" height="10" patternUnits="userSpaceOnUse">
          <rect x="5" width="1.4" height="10" fill="#000" opacity="0.12" />
        </pattern>
        {/* Perspectiva atmosférica: el agua aclara hacia el horizonte */}
        <linearGradient id="ie-mar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4e7e4" />
          <stop offset="1" stopColor="#7fc5c1" />
        </linearGradient>
        <linearGradient id="ie-cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor={astro.tinte} />
        </linearGradient>
        <linearGradient id="ie-tierra" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef3f4" />
          <stop offset="1" stopColor="#dbe4e7" />
        </linearGradient>
        <linearGradient id="ie-muelle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4ebee" />
          <stop offset="1" stopColor="#cfdadd" />
        </linearGradient>
        {/* Luz de arriba y sombra abajo, para dar volumen a los contenedores */}
        {/* Cromo de las chimeneas: brillo al centro para que se lean como tubo */}
        <linearGradient id="ie-cromo" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6f8a93" />
          <stop offset="0.45" stopColor="#eef3f5" />
          <stop offset="1" stopColor="#4f6a73" />
        </linearGradient>
        <linearGradient id="ie-volumen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="ie-fundido-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.1" stopColor="#fff" />
          <stop offset="0.9" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id="ie-fundido" maskUnits="userSpaceOnUse" x={MAR} y="0" width={MAR} height="260">
          <rect x={MAR} y="0" width={MAR} height="260" fill="url(#ie-fundido-grad)" />
        </mask>
        <filter id="ie-difuso" x="-10%" y="-200%" width="120%" height="500%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <radialGradient id="ie-halo">
          <stop offset="0" stopColor={astro.esDia ? '#f5c84c' : '#7f93c4'} stopOpacity={astro.esDia ? 0.45 : 0.55} />
          <stop offset="1" stopColor={astro.esDia ? '#f5c84c' : '#7f93c4'} stopOpacity="0" />
        </radialGradient>
        {/* Luna creciente: un disco al que se le recorta otro desplazado */}
        <mask id="ie-creciente" maskUnits="userSpaceOnUse" x="-20" y="-20" width="40" height="40">
          <circle r="15" fill="#fff" />
          <circle cx="7" cy="-5" r="13" fill="#000" />
        </mask>
        {/* Buque portacontenedores, con la línea de flotación en y=0 */}
        {/* Buque portacontenedores en volumen (usuario, 2026-11-19): cubierta con
            su cara de arriba, contenedores y puente como cajas, y el casco con
            sombreado y la franja roja de la línea de flotación (y=0). */}
        <g id="ie-buque">
          <path d="M0 -10 L7 -15 H203 L196 -10 Z" fill="#2a4a68" />
          {BUQUE_CARGA.map(([x, y, color]) => (
            <Contenedor key={`${x}-${y}`} x={x} y={y} w={20} h={10} color={color} />
          ))}
          <Caja x={4} y={-34} w={14} h={24} d={[5, 4]} frente="#f4f7f8" arriba="#ffffff" canto="#c9d6db" />
          <rect x="6" y="-30" width="10" height="3" fill="#102a43" />
          <Caja x={8} y={-41} w={6} h={7} d={[3, 2]} frente="#c9584b" arriba="#e0857b" canto="#9e3a30" />
          <path d="M0 -10 H196 L186 4 H10 Z" fill="#102a43" />
          <path d="M0 -10 H196 L186 4 H10 Z" fill="url(#ie-volumen)" />
          <path d="M5 -3 H191 L189 0 H7 Z" fill="#c9584b" />
        </g>
      </defs>

      <rect x="0" y="0" width="760" height={HORIZONTE} fill="url(#ie-cielo)" />

      {/* Sol o luna, antes de la costa para que salga y se ponga tras ella */}
      <g className="ie-astro" transform={`translate(${astro.x.toFixed(1)} ${astro.y.toFixed(1)})`}>
        <circle r={astro.esDia ? 38 : 30} fill="url(#ie-halo)" />
        {astro.esDia
          ? <circle r="15" fill="#f5c84c" />
          // Luna: amarillo pálido con contorno dorado y halo azul, para que se
          // distinga del cielo claro (antes era blanca y se perdía).
          : <circle r="15" fill="#fbeeb8" stroke="#c9a03c" strokeWidth="1.5" mask="url(#ie-creciente)" />}
      </g>

      {/* Dos capas en bucle, cada una del doble de ancho y repetida dos veces
          para que el corte no se note (App.css: inicio-panorama). */}
      <g className="ie-lejos">
        <Lejos />
        <g transform={`translate(${MAR * 2} 0)`}><Lejos /></g>
      </g>
      <g className="ie-panorama">
        <Cerca />
        <g transform={`translate(${MAR * 2} 0)`}><Cerca /></g>
      </g>

      {/* Muelle en primer plano, con su canto iluminado */}
      <rect x="0" y={MUELLE} width="760" height={260 - MUELLE} fill="url(#ie-muelle)" />
      <path d={`M0 ${MUELLE} H760`} stroke="#ffffff" strokeWidth="2" />

      <g transform="translate(0 50)">
      <path className="ie-carril" d="M0 190 H760" stroke="#b9c8cd" strokeWidth="3" strokeDasharray="22 16" />
      {/* Sombra del tracto en el muelle */}
      <ellipse cx="380" cy="180" rx="265" ry="5" fill="#102a43" opacity="0.22" filter="url(#ie-difuso)" />

      {/* Full: dos contenedores rojos y cabina blanca (usuario, 2026-11-19).
          Rueda en su sitio: el carril corre debajo, las llantas giran y la
          unidad cabecea un poco, como si fuera por carretera (App.css).
          1.2x, escalado desde donde las llantas pisan el carril y centrado en
          la escena: el full es casi el doble de largo que el sencillo. */}
      <g className="ie-tracto" transform="translate(380 178) scale(1.2) translate(-333 -178)">
        {/* Banda de rodadura de las llantas: el cilindro hacia la fuga (+4 -3.5) */}
        {LLANTAS.map((cx) => (
          <g key={cx} fill="#0a1b2c">
            <circle cx={cx + 4} cy={166 - 3.5} r="12" />
            <path d={`M${cx + 7.9} ${166 + 9} L${cx + 11.9} ${166 + 5.5} L${cx - 3.9} ${166 - 12.5} L${cx - 7.9} ${166 - 9} Z`} />
          </g>
        ))}
        <g className="ie-carroceria">
          {/* Remolque trasero, el convertidor con su lanza y el delantero */}
          <Remolque x={122} largo={160} plataforma={[118, 288]} />
          <rect x="288" y="156" width="8" height="3" rx="1" fill="#102a43" />
          <Remolque x={300} largo={160} plataforma={[294, 534]} />
          {/* Cabina */}
          {/* Chimenea del lado de allá: con la fuga de la escena y antes de la
              cabina, que le tapa la base */}
          <Chimenea x={478} y={77} />
          {/* Cabina en volumen (usuario, 2026-11-19): techo y frente (cofre y
              parabrisas) con la fuga de la escena, +8 -7, y el costado sombreado */}
          <path d="M482 104 L490 97 H520 L512 104 Z" fill="#f4f7f8" stroke="#102a43" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M512 104 L520 97 Q528 97 532 105 L548 131 Q552 137 552 143 V154 L544 161 V150 Q544 144 540 138 L524 112 Q520 104 512 104 Z" fill="#cdd8de" stroke="#102a43" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M527 113 L533 108 L545 128 L539 134 Z" fill="#7fb0bb" />
          <path d="M474 161 V112 Q474 104 482 104 H512 Q520 104 524 112 L540 138 Q544 144 544 150 V161 Z" fill="#ffffff" stroke="#102a43" strokeWidth="2" strokeLinejoin="round" />
          <path d="M474 161 V112 Q474 104 482 104 H512 Q520 104 524 112 L540 138 Q544 144 544 150 V161 Z" fill="url(#ie-volumen)" />
          {/* Tanque de diésel bajo la puerta */}
          <Caja x={490} y={157} w={24} h={6} d={[4, 3]} frente="#c9d6db" arriba="#eef3f5" canto="#8fa3ab" />
          <path d="M486 112 H510 L524 136 H486 Z" fill="#9fc7cf" />
          {/* Logo de FRABA en la puerta, bajo la ventana (226×132 de origen) */}
          <image href={logoFraba} x="485" y="139" width="33" height="19" preserveAspectRatio="xMidYMid meet" />
          {/* Chimenea de este lado (la del otro lado va detrás de la cabina) */}
          <Chimenea x={470} y={84} />
        </g>
        {/* Cara de las llantas: goma, rin con sombreado y rayos para que se note el giro */}
        {LLANTAS.map((cx) => (
          <g key={cx} className="ie-llanta">
            <circle cx={cx} cy="166" r="12" fill="#1c3550" stroke="#0a1b2c" strokeWidth="1" />
            <circle cx={cx} cy="166" r="8" fill="#8fa3ab" />
            <circle cx={cx} cy="166" r="8" fill="url(#ie-volumen)" />
            <path d={`M${cx - 6} 166 H${cx + 6} M${cx} 160 V172`} stroke="#4f6a73" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx={cx} cy="166" r="2.6" fill="#eef3f5" stroke="#4f6a73" strokeWidth="0.8" />
          </g>
        ))}
      </g>
      </g>
    </svg>
  );
}
