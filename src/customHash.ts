import * as crypto from 'crypto'
const salt = Buffer.alloc(0)
const length = 20
const N = 1024
const r = 8
const p = 1
const maxmem = 256 * N * r
const options = {
    N,
    r,
    p,
    maxmem
}
export default (data) => {
    const password = crypto.createHash('blake2b512').update(data).digest()
    return crypto.scryptSync(password, salt, length, options)
}