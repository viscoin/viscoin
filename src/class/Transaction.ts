import * as crypto from 'crypto'
import * as config from '../../config.json'
interface Transaction {
    fromAddress: string
    toAddress: string
    amount: number
    minerFee: number
    signature: string
    // timestamp: number
    blockHeight: number
}
class Transaction {
    constructor({ fromAddress, toAddress, amount, blockHeight, minerFee = 0, signature = undefined }) {
        this.fromAddress = fromAddress
        this.toAddress = toAddress
        this.amount = amount
        this.minerFee = minerFee
        if (signature) this.signature = signature
        // this.timestamp = Date.now()
        this.blockHeight = blockHeight
    }
    calculateHash() {
        return crypto.createHash('sha256')
        .update(
            this.fromAddress
            + this.toAddress
            + this.amount
            + this.minerFee
            // + this.timestamp
            + this.blockHeight
        )
        .digest('hex')
    }
    signTransaction({ publicKey, privateKey }) {
        if (publicKey !== this.fromAddress) {
            throw new Error('You cannot sign transactions for other wallets!')
        }
        const sign = crypto.createSign('sha256')
        sign.update(this.calculateHash())
        sign.end()
        this.signature = sign.sign(privateKey, 'base64')
    }
    isValid(blockHeight) {
        if (this.fromAddress === config.mining.reward.fromAddress) return true
        if (!this.signature || this.signature.length === 0) {
            throw new Error('No signature in this transaction!')
        }
        if (this.blockHeight !== blockHeight) throw new Error('Transaction not signed for this blockHeight!')
        const verify = crypto.createVerify('sha256')
        verify.update(this.calculateHash())
        verify.end()
        return verify.verify(this.fromAddress, this.signature, 'base64')
    }
}
export default Transaction