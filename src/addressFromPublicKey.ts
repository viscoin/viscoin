import * as crypto from 'crypto'
export default (publicKey: Buffer) => {
    return crypto.createHash('sha256').update(publicKey).digest().slice(-20)
}