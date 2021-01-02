import * as crypto from 'crypto'
const hashes = [
    'blake2b512',
    'sha3-512',
    'sha256'
]
export default (data) => {
    for (const hash of hashes) {
        data = crypto.createHash(hash).update(data).digest()
    }
    return data
}