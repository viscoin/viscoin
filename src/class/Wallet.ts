import Blockchain from './Blockchain'
import Transaction from './Transaction'
import ClientNode from './ClientNode'
import FullNode from './FullNode'
import * as config from '../../config.json'
interface Wallet {
    publicKey: string,
    privateKey: string,
}
class Wallet extends FullNode {
    constructor({ publicKey, privateKey }: { publicKey: string, privateKey: string }) {
        super()
        this.publicKey = publicKey
        this.privateKey = privateKey
    }
    async balance() {
        return await this.blockchain.getBalanceOfAddress(this.publicKey)
    }
    // send(address: string, amount: number, minerFee: number) {
    send({ address, amount, minerFee }: { address: string, amount: number, minerFee: number }) {
        const transaction = new Transaction({
            fromAddress: this.publicKey,
            toAddress: address,
            amount,
            minerFee
        })
        transaction.signTransaction({
            publicKey: this.publicKey,
            privateKey: this.privateKey
        })
        this.blockchain.addTransaction(transaction)
        this.broadcastAndStoreDataHash(Buffer.from(Buffer.alloc(1, ClientNode.getType('transaction')) + JSON.stringify(transaction)))
        return transaction
    }
    address() {
        return this.publicKey
    }
}
export default Wallet