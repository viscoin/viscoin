import * as crypto from 'crypto'
interface Transaction {
    fromAddress: string,
    toAddress: string,
    amount: number,
    signature: string
}
class Transaction {
    constructor({ fromAddress, toAddress, amount, signature }) {
        this.fromAddress = fromAddress
        this.toAddress = toAddress
        this.amount = amount
        if (signature) this.signature = signature
    }
    calculateHash() {
        return crypto.createHash('sha256')
        .update(
            this.fromAddress
            + this.toAddress
            + this.amount
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
        if (this.fromAddress === 'mining reward') return true
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