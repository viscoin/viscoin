import Blockchain from './Blockchain'
import Transaction from './Transaction'
import ClientNode from './ClientNode'
interface Wallet {
    blockchain: Blockchain,
    publicKey: string,
    privateKey: string,
    clientNode: ClientNode
}
class Wallet {
    constructor({ publicKey, privateKey }: { publicKey: string, privateKey: string }) {
        this.blockchain = new Blockchain()
        this.publicKey = publicKey
        this.privateKey = privateKey
        this.clientNode = new ClientNode()
    }
    async balance() {
        return await this.blockchain.getBalanceOfAddress(this.publicKey)
    }
    // send(address: string, amount: number, minerFee: number) {
    send({ address, amount, minerFee }: { address: string, amount: number, minerFee: number }) {
        if (!this.clientNode.sockets.length) return
        const transaction = new Transaction({
            fromAddress: this.publicKey,
            toAddress: address,
            amount,
            minerFee,
            blockHeight: this.blockchain.getLatestBlock().height + 1
        })
        transaction.signTransaction({
            publicKey: this.publicKey,
            privateKey: this.privateKey
        })
        this.blockchain.addTransaction(transaction)
        this.clientNode.broadcast(Buffer.from(Buffer.alloc(1, 1) + JSON.stringify(transaction)))
        console.log(transaction)
    }
    address() {
        return this.publicKey
    }
}
export default Wallet