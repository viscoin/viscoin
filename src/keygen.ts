import * as crypto from 'crypto'
import * as elliptic from 'elliptic'
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