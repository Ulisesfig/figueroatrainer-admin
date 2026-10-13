// Firma propia de las actualizaciones (Ed25519). El instalador no tiene firma de Windows, así
// que sin esto bastaba con poder escribir en el bucket para que las PCs de los admins instalaran
// cualquier cosa. La clave privada vive solo en la máquina que publica (tools/.env.updates).
const crypto = require('crypto');

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA3uziwZfggTtMB1lOZqQTX0ONBbkd9oiw9GB9p3/J/qQ=
-----END PUBLIC KEY-----`;

// Se firma la versión junto con el sha512 del instalador: electron-updater ya verifica que el
// archivo descargado coincide con ese sha512, así que la firma cubre el binario completo.
function signedMessage(version, sha512) {
  return Buffer.from(`figueroa-trainer-admin\n${version}\n${sha512}`, 'utf8');
}

function sign(version, sha512, privateKeyPem) {
  return crypto.sign(null, signedMessage(version, sha512), privateKeyPem).toString('base64');
}

function verify(version, sha512, signatureBase64, publicKeyPem = PUBLIC_KEY_PEM) {
  if (!version || !sha512 || !signatureBase64) return false;
  try {
    return crypto.verify(null, signedMessage(version, sha512), publicKeyPem, Buffer.from(String(signatureBase64).trim(), 'base64'));
  } catch (_) {
    return false;
  }
}

module.exports = { sign, verify, signedMessage, PUBLIC_KEY_PEM };
