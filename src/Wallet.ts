import Transaction from './Transaction'
import addressFromPublicKey from './addressFromPublicKey'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
interface Wallet {
    privateKey: Buffer
    publicKey: Buffer
    address: Buffer
}
class Wallet {
    constructor(privateKey: Buffer) {
        this.privateKey = privateKey
        this.publicKey = publicKeyFromPrivateKey(this.privateKey)
        this.address = addressFromPublicKey(this.publicKey)
    }
    createTransaction({ to, amount, minerFee }: { to: Buffer | undefined, amount: string | undefined, minerFee: string }) {
        const transaction = new Transaction({
            to,
            amount,
            minerFee,
            timestamp: Date.now()
        })
        transaction.sign(this.privateKey)
        return transaction
    }
}
export default Wallet