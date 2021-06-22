import * as secp256k1 from 'secp256k1'
export default (privateKey: Buffer) => {
    return Buffer.from(secp256k1.publicKeyCreate(privateKey, false))
}