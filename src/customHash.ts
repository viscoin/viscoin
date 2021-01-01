import * as crypto from 'crypto'
const hashes = [
    'sha3-512',
    'sha512',
    'whirlpool',
    'blake2s256'
]
// const hashes = [
//     'sha3-512',
//     'sha512',
//     'whirlpool',
//     'blake2b512',
//     'shake256'
// ]
export default (data) => {
    for (const hash of hashes) {
        data = crypto.createHash(hash).update(data).digest()
    }
    return data
}