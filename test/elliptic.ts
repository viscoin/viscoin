import * as elliptic from 'elliptic'
import * as crypto from 'crypto'
import base58 from '../src/base58'



const seed = crypto.randomBytes(32)
const message = 'asdfasdfasdfasdf'.split('')

const privateKey = crypto.createHash('sha256').update(seed).digest()
console.log(base58.encode(privateKey))
const ec = new elliptic.ec('secp256k1')
let key = ec.keyFromPrivate(privateKey)
// console.log(key.inspect())
const pubPoint = key.getPublic()
const publicKey = Buffer.from(pubPoint.encode())
console.log(base58.encode(publicKey))
const address = crypto.createHash('sha3-256').update(publicKey).digest().slice(12)
console.log(base58.encode(address))
const signature = key.sign(message)

console.log(signature.recoveryParam)
console.log(base58.encode(signature.toDER()))
const recoveredPoint = ec.recoverPubKey(message, signature.toDER(), signature.recoveryParam)
key = ec.keyFromPublic(recoveredPoint)
// console.log(key.inspect())
const recoveredPublicKey = Buffer.from(recoveredPoint.encode())
console.log(base58.encode(recoveredPublicKey))

const verified = key.verify(message, signature)
console.log('verified', verified)