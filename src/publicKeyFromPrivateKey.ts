import * as elliptic from 'elliptic'
const ec = new elliptic.ec('secp256k1')
export default (privateKey: Buffer) => {
    const key = ec.keyFromPrivate(privateKey)
    const pubPoint = key.getPublic()
    return Buffer.from(pubPoint.encode())
}