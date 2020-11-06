import * as crypto from 'crypto'
import * as config from '../../config.json'
import base58 from '../function/base58'
import customHash from '../function/customHash'
interface Transaction {
    fromAddress: string
    toAddress: string
    timestamp: number
    amount: number
    minerFee: number
    signature: Buffer
}
class Transaction {
    constructor({ fromAddress, toAddress, amount, timestamp = Date.now(), minerFee = 0, signature = undefined }) {
        this.fromAddress = fromAddress
        this.toAddress = toAddress
        this.timestamp = timestamp
        this.amount = amount
        this.minerFee = minerFee
        if (signature instanceof Buffer) this.signature = signature
        else if (signature && signature._bsontype === 'Binary') this.signature = Buffer.from(signature.buffer)
        else if (signature) this.signature = Buffer.from(signature)
    }
    calculateHash() {
        return customHash(
            this.fromAddress
            + this.toAddress
            + this.amount
            + this.minerFee
            + this.timestamp
        )
    }
    sign({ publicKey, privateKey }) {
        if (publicKey !== this.fromAddress) {
            throw new Error('You cannot sign transactions for other wallets!')
        }
        this.signature = crypto.sign(null, this.calculateHash(), crypto.createPrivateKey({
            key: base58.decode(privateKey),
            type: 'pkcs8',
            format: 'der'
        }))
    }
    verify() {
        if (this.fromAddress === config.mining.reward.fromAddress) return true
        if (!this.signature || !Buffer.byteLength(this.signature)) {
            console.log('!this.signature || !Buffer.byteLength(this.signature)')
            return false
        }
        return crypto.verify(null, this.calculateHash(), crypto.createPublicKey({
            key: base58.decode(this.fromAddress),
            type: 'spki',
            format: 'der'
        }), this.signature)
    }
}
export default Transaction