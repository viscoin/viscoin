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
]
export default (data) => {
    for (const hash of hashes) {
        data = crypto.createHash(hash).update(data).digest()
    }
    return data
}