import * as crypto from 'crypto'
const hashes = [
    'blake2b512',
    'sha256'
]
export default (data) => {
    for (const hash of hashes) {
        data = crypto.createHash(hash).update(data).digest()
    }
    return data
}
// import * as crypto from 'crypto'
// const length = 20,
// N = Math.pow(2, 16),
// r = 8
// const maxmem = 2 * 128 * N * r
// export default (data) => {
//     const password = crypto.createHash('blake2b512').update(data).digest()
//     const salt = crypto.createHash('sha256').update(password).digest()
//     return crypto.scryptSync(password, salt, length, {
//         N,
//         r,
//         maxmem
//     })
// }