import Transaction from './Transaction'
import FullNode from './FullNode'
import Node from './Node'
interface Wallet {
    keys: Array<{ publicKey: string, privateKey: string }>
}
class Wallet extends FullNode {
    constructor() {
        super()
        this.keys = []
    }
    async balance(address: string = undefined) {
        if (address) return await this.blockchain.getBalanceOfAddress(address)
        else {
            let sum = 0
            for (const key of this.keys) {
                sum += await this.blockchain.getBalanceOfAddress(key.publicKey)
            }
            return sum
        }
    }
    send({ publicKey, privateKey, toAddress, amount, minerFee }: { publicKey: string, privateKey: string, toAddress: string, amount: number | string, minerFee: number | string }) {
        if (typeof amount === 'string') amount = parseFloat(amount)
        if (typeof minerFee === 'string') minerFee = parseFloat(minerFee)
        const transaction = new Transaction({
            fromAddress: publicKey,
            toAddress,
            amount,
            minerFee
        })
        transaction.sign({
            publicKey,
            privateKey
        })
        this.blockchain.addTransaction(transaction)
        this.broadcastAndStoreDataHash(Node.constructDataBuffer('transction', transaction))
        return transaction
    }
    setKeys(keys: Array<{ publicKey: string, privateKey: string }>) {
        this.keys = keys
    }
    addKey(key: { publicKey: string, privateKey: string }) {
        this.keys.push(key)
    }
    listKeys() {
        console.log(this.keys)
    }
}
export default Wallet