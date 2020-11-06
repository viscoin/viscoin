import * as crypto from 'crypto'
const hashes = [
    'sha3-512',
    'sha512',
    'blake2b512',
    'whirlpool',
    'sha3-384',
    'sha384',
    'sha3-256',
    'sha256',
    'blake2s256',
    'shake256'
],
N = 256,
r = 8,
p = 1
const maxmem = 128 * N * r * 2
export default (data) => {
    data = crypto.scryptSync(data, '', 64, { N, r, p, maxmem })
    for (const hash of hashes) {
        data = crypto.createHash(hash).update(data).digest()
    }
    return data
}