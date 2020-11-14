import * as crypto from 'crypto'
import Transaction from './Transaction'
import base58 from './base58'
import protocol from './protocol'
import BaseClient from "./BaseClient"
interface WalletClient {
    wallet: { name: string, address: string, secret: string }
}
class WalletClient extends BaseClient {
    constructor() {
        super()
        this.wallet = null
    }
    static generate() {
        const key = crypto.generateKeyPairSync('ed25519')
        const publicKey = key.publicKey.export({
            type: 'spki',
            format: 'der'
        })
        const privateKey = key.privateKey.export({
            type: 'pkcs8',
            format: 'der'
        })
        const address = base58.encode(publicKey)
        const secret = base58.encode(privateKey)
        return {
            address,
            secret
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