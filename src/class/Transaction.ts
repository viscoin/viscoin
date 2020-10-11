import * as crypto from 'crypto'
import * as config from '../../config.json'
interface Transaction {
    fromAddress: string
    toAddress: string
    amount: number
    minerFee: number
    signature: string
}
class Transaction {
    constructor({ fromAddress, toAddress, amount, minerFee = 0, signature = undefined }) {
        this.fromAddress = fromAddress
        this.toAddress = toAddress
        this.amount = amount
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
    isValid() {
        if (this.fromAddress === config.mining_reward_address) return true
        if (!this.signature || this.signature.length === 0) {
            throw new Error('No signature in this transaction!')
        }
        const verify = crypto.createVerify('sha256')
        verify.update(this.calculateHash())
        verify.end()
        return verify.verify(this.fromAddress, this.signature, 'base64')
    }
}
export default Transaction