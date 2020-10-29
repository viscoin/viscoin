import Transaction from './Transaction'
import ClientNode from './ClientNode'
import FullNode from './FullNode'
interface Wallet {
    keys: Array<{ publicKey: string, privateKey: string }>
}
class Wallet extends FullNode {
    constructor(keys: Array<{ publicKey: string, privateKey: string }>) {
        super()
        if (keys) this.keys = keys
        else this.keys = []
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
    send({ publicKey, privateKey, toAddress, amount, minerFee }: { publicKey: string, privateKey: string, toAddress: string, amount: number, minerFee: number }) {
        const transaction = new Transaction({
            fromAddress: publicKey,
            toAddress,
            amount,
            minerFee
        })
        transaction.signTransaction({
            publicKey,
            privateKey
        })
        this.blockchain.addTransaction(transaction)
        this.broadcastAndStoreDataHash(Buffer.from(Buffer.alloc(1, ClientNode.getType('transaction')) + JSON.stringify(transaction)))
        return transaction
    }
}
export default Wallet