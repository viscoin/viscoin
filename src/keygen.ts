import * as crypto from 'crypto'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import addressFromPublicKey from './addressFromPublicKey'
import { setPriority } from 'os'
export default (seed: Buffer | undefined = undefined) => {
    if (seed) {
        setPriority(19)
        for (let i = 0; i < 10**6; i++) {
            seed = crypto.createHash('sha256').update(seed).digest()
            if (i % 10**4 === 0) console.log(i / 10**4, '%')
        }
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