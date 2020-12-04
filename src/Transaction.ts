import * as crypto from 'crypto'
import * as config from '../config.json'
import base58 from './base58'
import customHash from './customHash'
interface Transaction {
    from: string
    to: string
    timestamp: number
    amount: number
    minerFee: number
    signature: Buffer
}
class Transaction {
    constructor({ from, to, amount, timestamp = Date.now(), minerFee = 0, signature = undefined }) {
        this.from = from
        this.to = to
        this.timestamp = timestamp
        this.amount = amount
        this.minerFee = minerFee
        if (signature instanceof Buffer) this.signature = signature
        else if (signature && signature._bsontype === 'Binary') this.signature = Buffer.from(signature.buffer)
        else if (signature) this.signature = Buffer.from(signature)
    }
    calculateHash() {
        return customHash(
            this.from
            + this.to
            + this.amount
            + this.minerFee
            + this.timestamp
        )
    }
    sign({ address, secret }) {
        if (address !== this.from) {
            throw new Error('You cannot sign transactions for other wallets!')
        }
        this.signature = crypto.sign(null, this.calculateHash(), crypto.createPrivateKey({
            key: base58.decode(secret),
            type: 'pkcs8',
            format: 'der'
        }))
    }
    verify() {
        if (!this.signature || !Buffer.byteLength(this.signature)) {
            console.log('!this.signature || !Buffer.byteLength(this.signature)')
            return false
        }
        return crypto.verify(null, this.calculateHash(), crypto.createPublicKey({
            key: base58.decode(this.from),
            type: 'spki',
            format: 'der'
        }), this.signature)
    }
}
export default Transaction