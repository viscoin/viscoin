import * as crypto from 'crypto'
import * as secp256k1 from 'secp256k1'
export default () => {
    let privateKey
    do {
        privateKey = crypto.randomBytes(32)
    } while (!secp256k1.privateKeyVerify(privateKey))
    return privateKey
}