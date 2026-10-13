// Sube el instalador recién compilado (dist/) al bucket de Railway que sirve
// /updates en el backend. Reemplaza el viejo flujo de "GH_TOKEN + electron-builder
// --publish" por algo que no pide un token nuevo cada vez: las credenciales del
// bucket quedan una sola vez en tools/.env.updates (fuera de git) y listo.
//
// Uso: npm run dist   (genera los archivos en dist/)
//      npm run publish-update
require('dotenv').config({ path: require('path').join(__dirname, '.env.updates') });

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const updateSignature = require('../src/updateSignature');

const DIST_DIR = path.join(__dirname, '..', 'dist');

const CONTENT_TYPES = {
  '.yml': 'text/yaml; charset=utf-8',
  '.exe': 'application/x-msdownload',
  '.blockmap': 'application/octet-stream',
  '.sig': 'text/plain; charset=utf-8',
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable ${name}. Completá tools/.env.updates (ver tools/.env.updates.example).`);
  }
  return value;
}

async function main() {
  const bucket = requireEnv('UPDATES_S3_BUCKET');
  const s3 = new S3Client({
    endpoint: requireEnv('UPDATES_S3_ENDPOINT'),
    region: process.env.UPDATES_S3_REGION || 'auto',
    credentials: {
      accessKeyId: requireEnv('UPDATES_S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('UPDATES_S3_SECRET_ACCESS_KEY'),
    },
  });

  // dist/ acumula los instaladores de todas las versiones compiladas; latest.yml dice
  // cuál es la de esta vez, así que solo subimos esa (más su .blockmap) y el propio latest.yml.
  const ymlPath = path.join(DIST_DIR, 'latest.yml');
  if (!fs.existsSync(ymlPath)) {
    throw new Error(`No existe ${ymlPath}. Corré "npm run dist" primero.`);
  }
  const yml = fs.readFileSync(ymlPath, 'utf8');
  const installerName = yml.match(/^path:\s*(.+)$/m)?.[1]?.trim();
  const version = yml.match(/^version:\s*(.+)$/m)?.[1]?.trim();
  const sha512 = yml.match(/^sha512:\s*(.+)$/m)?.[1]?.trim();
  if (!installerName || !version || !sha512) {
    throw new Error('No se pudo leer instalador, versión o sha512 desde latest.yml');
  }

  // La app instalada solo instala si latest.sig es una firma válida de esta versión + sha512.
  const privateKey = Buffer.from(requireEnv('UPDATES_SIGNING_KEY'), 'base64').toString('utf8');
  const signature = updateSignature.sign(version, sha512, privateKey);
  if (!updateSignature.verify(version, sha512, signature)) {
    throw new Error('UPDATES_SIGNING_KEY no corresponde a la clave pública de src/updateSignature.js');
  }
  fs.writeFileSync(path.join(DIST_DIR, 'latest.sig'), signature);

  // latest.yml va último: hasta que se sube, las apps siguen viendo la versión anterior completa.
  const files = [installerName, `${installerName}.blockmap`, 'latest.sig', 'latest.yml']
    .filter((name) => fs.existsSync(path.join(DIST_DIR, name)));

  if (!files.length) {
    throw new Error(`No hay archivos para subir en ${DIST_DIR}. Corré "npm run dist" primero.`);
  }

  for (const name of files) {
    const ext = name.endsWith('.blockmap') ? '.blockmap' : path.extname(name);
    const filePath = path.join(DIST_DIR, name);
    console.log(`Subiendo ${name}...`);
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: name,
      Body: fs.createReadStream(filePath),
      ContentLength: fs.statSync(filePath).size,
      ContentType: CONTENT_TYPES[ext] || 'application/octet-stream',
    }));
  }

  console.log(`Listo. ${files.length} archivo(s) publicados en el feed de actualizaciones.`);
}

main().catch((error) => {
  console.error('Error publicando la actualización:', error.message);
  process.exit(1);
});
