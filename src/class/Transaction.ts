import * as crypto from 'crypto'
import * as config from '../../config.json'
import * as baseX from 'base-x'
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const base58 = baseX(BASE58)
interface Transaction {
    fromAddress: string
    toAddress: string
    amount: number
    minerFee: number
    signature: Buffer
    timestamp: number
}
class Transaction {
    constructor({ fromAddress, toAddress, amount, timestamp = Date.now(), minerFee = 0, signature = undefined }) {
        this.fromAddress = fromAddress
        this.toAddress = toAddress
        this.amount = amount
        this.timestamp = timestamp
        this.minerFee = minerFee
        if (signature) this.signature = signature
    }
    calculateHash() {
        return crypto.createHash('sha256')
            .update(
                this.fromAddress
                + this.toAddress
                + this.amount
                + this.minerFee
                + this.timestamp
            )
            .digest()
    }
    signTransaction({ publicKey, privateKey }) {
        if (publicKey !== this.fromAddress) {
            throw new Error('You cannot sign transactions for other wallets!')
        }
        this.signature = crypto.sign(null, this.calculateHash(), crypto.createPrivateKey({
            key: base58.decode(privateKey),
            type: 'pkcs8',
            format: 'der'
        }))
    }
    isValid() {
        if (this.fromAddress === config.mining.reward.fromAddress) return true
        if (!this.signature || this.signature.length === 0) {
            throw new Error('No signature in this transaction!')
        }
        return crypto.verify(null, this.calculateHash(), crypto.createPublicKey({
            key: base58.decode(this.fromAddress),
            type: 'spki',
            format: 'der'
        }), this.signature)
    }
}
export default Transaction