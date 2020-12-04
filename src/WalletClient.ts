import Transaction from './Transaction'
import protocol from './protocol'
import BaseClient from "./BaseClient"
import keygen from './keygen'
interface WalletClient {
    wallet: { name: string, address: string, secret: string }
}
class WalletClient extends BaseClient {
    constructor() {
        super()
        this.wallet = null
    }
    static generate = keygen
    // !
    send({ address, secret, to, amount, minerFee }: { address: string, secret: string, to: string, amount: number | string, minerFee: number | string }) {
        // !
        if (typeof amount === 'string') amount = parseFloat(amount)
        if (typeof minerFee === 'string') minerFee = parseFloat(minerFee)
        amount += minerFee
        const transaction = new Transaction({
            from: address,
            to,
            amount,
            minerFee
        })
        transaction.sign({
            address,
            secret
        })
        this.blockchain.addTransaction(transaction)
        this.node.broadcastAndStoreDataHash(protocol.constructDataBuffer('transaction', transaction))
        return transaction
    }
    import(wallet: { name: string, address: string, secret: string }) {
        this.wallet = wallet
    }
    async balance(address: string = undefined) {
        if (address) return await this.blockchain.getBalanceOfAddress(address)
        else return await this.blockchain.getBalanceOfAddress(this.wallet.address)
    }
    async transactions(address: string = undefined) {
        if (address) return await this.blockchain.getTransactionsOfAddress(address)
        else return await this.blockchain.getTransactionsOfAddress(this.wallet.address)
    }
}
export default WalletClient