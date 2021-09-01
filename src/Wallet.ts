import Transaction from './Transaction'
import addressFromPublicKey from './addressFromPublicKey'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import Address from './Address'
import keygen from './keygen'
interface Wallet {
    privateKey: Buffer
    publicKey: Buffer
    _address: Buffer
    address: string
}
class Wallet {
    constructor(privateKey: Buffer | undefined = undefined) {
        if (privateKey === undefined) privateKey = keygen()
        this.privateKey = privateKey
        this.publicKey = publicKeyFromPrivateKey(this.privateKey)
        this._address = addressFromPublicKey(this.publicKey)
        this.address = Address.toString(this._address)
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