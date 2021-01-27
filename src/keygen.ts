import * as crypto from 'crypto'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import addressFromPublicKey from './addressFromPublicKey'
export default async (seed: Buffer | undefined = undefined) => {
    if (seed) seed = crypto.createHash('sha256').update(seed).digest()
    else seed = crypto.randomBytes(32)
    const privateKey = seed
    const publicKey = publicKeyFromPrivateKey(privateKey)
    const address = addressFromPublicKey(publicKey)
    return {
        privateKey,
        publicKey,
        address
    }
}