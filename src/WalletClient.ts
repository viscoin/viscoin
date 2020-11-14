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
        this.node.broadcastAndStoreDataHash(protocol.constructDataBuffer('transction', transaction))
        return transaction
    }
    import(wallet: { name: string, address: string, secret: string }) {
        this.wallet = wallet
    }
    async balance(address: string = undefined) {
        if (address) return await this.blockchain.getBalanceOfAddress(address)
        else return await this.blockchain.getBalanceOfAddress(this.wallet.address)
    }
}
export default WalletClient