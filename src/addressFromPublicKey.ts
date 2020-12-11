import * as crypto from 'crypto'
export default (publicKey: Buffer) => {
    const a = crypto.createHash('sha256').update(publicKey).digest()
    const b = crypto.createHash('sha3-256').update(a).digest()
    return Buffer.concat([a.slice(-10), b.slice(-10)])
}