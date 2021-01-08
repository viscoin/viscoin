import * as crypto from 'crypto'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import addressFromPublicKey from './addressFromPublicKey'
import { setPriority } from 'os'
import customHash from './customHash'
export default async (seed: Buffer | undefined = undefined) => {
    if (seed) {
        setPriority(19)
        seed = await customHash(seed)
    }
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