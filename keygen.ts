import * as fs from 'fs'
import * as keys from './keys.json'
import * as crypto from 'crypto'
import * as baseX from 'base-x'
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const base58 = baseX(BASE58)

let key = crypto.generateKeyPairSync('ed25519')

let publicKey: any = key.publicKey
let privateKey: any = key.privateKey

let publicKeyExported = publicKey.export({
    type: 'spki',
    format: 'der'
})
let privateKeyExported = privateKey.export({
    type: 'pkcs8',
    format: 'der'
})
console.log(publicKeyExported)
console.log(privateKeyExported)

let publicKeyEncoded = base58.encode(publicKeyExported)
let privateKeyEncoded = base58.encode(privateKeyExported)
console.log(publicKeyEncoded)
console.log(privateKeyEncoded)

let publicKeyDecoded = base58.decode(publicKeyEncoded)
let privateKeyDecoded = base58.decode(privateKeyEncoded)
console.log(publicKeyDecoded)
console.log(privateKeyDecoded)

let publicKeyImported = crypto.createPublicKey({
    key: publicKeyDecoded,
    type: 'spki',
    format: 'der'
})
let privateKeyImported = crypto.createPrivateKey({
    key: privateKeyDecoded,
    type: 'pkcs8',
    format: 'der'
}) 
console.log(publicKeyImported)
console.log(privateKeyImported)

const test = (publicKey, privateKey) => {
    let message = 'hej'
    const signature = crypto.sign(null, Buffer.from(message), privateKey)
    console.log('Signature', signature)
    const verified = crypto.verify(null, Buffer.from(message), publicKey, signature)
    console.log('Verified', verified)
}
test(publicKeyImported, privateKeyImported)

keys.unshift({
    publicKey: publicKeyEncoded,
    privateKey: privateKeyEncoded
})
fs.writeFileSync('./keys.json', JSON.stringify(keys, null, 4))