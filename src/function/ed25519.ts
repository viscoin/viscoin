import * as crypto from 'crypto'
// import base58 from './base58'
export default () => {
    const key = crypto.generateKeyPairSync('ed25519')
    const publicKey = key.publicKey.export({
        type: 'spki',
        format: 'der'
    })
    const privateKey = key.privateKey.export({
        type: 'pkcs8',
        format: 'der'
    })
    return {
        publicKey,
        privateKey
    }
    // const address = base58.encode(publicKey)
    // const secret = base58.encode(privateKey)
    // return {
    //     address,
    //     secret
    // }
}