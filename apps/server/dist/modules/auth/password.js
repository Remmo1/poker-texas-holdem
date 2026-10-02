import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
export async function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = await scryptAsync(password, salt, KEY_LENGTH);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
    const [scheme, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex)
        return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(actual, expected);
}
//# sourceMappingURL=password.js.map