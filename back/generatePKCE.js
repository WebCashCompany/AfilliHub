const crypto = require('crypto');

function base64url(buffer) {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

const verifier = base64url(crypto.randomBytes(32));
const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest()
);

console.log('\n🔑 CODE VERIFIER:\n', verifier);
console.log('\n🔐 CODE CHALLENGE:\n', challenge);
