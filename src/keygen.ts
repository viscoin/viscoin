import * as crypto from 'crypto'
import * as elliptic from 'elliptic'
import addressFromPublicKey from './addressFromPublicKey'
export default (seed: Buffer | undefined = undefined) => {
    if (!seed) seed = crypto.randomBytes(32)
    const privateKey = crypto.createHash('sha256').update(seed).digest()
    const ec = new elliptic.ec('secp256k1')
    const key = ec.keyFromPrivate(privateKey)
    const pubPoint = key.getPublic()
    const publicKey = Buffer.from(pubPoint.encode())
    const address = addressFromPublicKey(publicKey)
    return {
        privateKey,
        publicKey,
        address
    }
}