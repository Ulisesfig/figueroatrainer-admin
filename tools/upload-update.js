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

const DIST_DIR = path.join(__dirname, '..', 'dist');

const CONTENT_TYPES = {
  '.yml': 'text/yaml; charset=utf-8',
  '.exe': 'application/x-msdownload',
  '.blockmap': 'application/octet-stream',
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
  const installerName = fs.readFileSync(ymlPath, 'utf8').match(/^path:\s*(.+)$/m)?.[1]?.trim();
  if (!installerName) {
    throw new Error('No se pudo leer el nombre del instalador desde latest.yml');
  }
  const files = ['latest.yml', installerName, `${installerName}.blockmap`]
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
