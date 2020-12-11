import * as elliptic from 'elliptic'
import customHash from './customHash'
import addressFromPublicKey from './addressFromPublicKey'
interface Transaction {
    from: Buffer
    to: Buffer
    timestamp: number
    amount: number
    minerFee: number
    signature: Buffer,
    recoveryParam: number
}
class Transaction {
    constructor({ from = undefined, to, amount, timestamp = Date.now(), minerFee = 0, signature = undefined, recoveryParam = undefined }) {
        this.timestamp = timestamp
        this.amount = amount
        this.minerFee = minerFee

        if (from instanceof Buffer) this.from = from
        else if (from && from._bsontype === 'Binary') this.from = Buffer.from(from.buffer)
        else if (from) this.from = Buffer.from(from)

        if (to instanceof Buffer) this.to = to
        else if (to && to._bsontype === 'Binary') this.to = Buffer.from(to.buffer)
        else if (to) this.to = Buffer.from(to)

        if (typeof recoveryParam === 'number') {
            if (signature instanceof Buffer) this.signature = signature
            else if (signature && signature._bsontype === 'Binary') this.signature = Buffer.from(signature.buffer)
            else if (signature) this.signature = Buffer.from(signature)

            this.recoveryParam = recoveryParam
        }
    }
    calculateHash() {
        return customHash(
            String(this.from)
            + String(this.to)
            + this.amount
            + this.minerFee
            + this.timestamp
        )
    }
    sign(privateKey: Buffer) {
        const ec = new elliptic.ec('secp256k1')
        const key = ec.keyFromPrivate(privateKey)
        const pubPoint = key.getPublic()
        const publicKey = Buffer.from(pubPoint.encode())
        this.from = addressFromPublicKey(publicKey)
        const hash = this.calculateHash()
        const signature = key.sign(hash)
        this.signature = Buffer.from(signature.toDER())
        this.recoveryParam = signature.recoveryParam
    }
    verify() {
        const ec = new elliptic.ec('secp256k1')
        const hash = this.calculateHash()
        const pubPoint = ec.recoverPubKey(hash, this.signature, this.recoveryParam)
        const publicKey = Buffer.from(pubPoint.encode())
        const address = addressFromPublicKey(publicKey)
        if (!address.equals(this.from)) return false
        const key = ec.keyFromPublic(pubPoint)
        return key.verify(hash, this.signature)
    }
}
export default Transaction