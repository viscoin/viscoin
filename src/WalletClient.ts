import * as elliptic from 'elliptic'
import Transaction from './Transaction'
import protocol from './protocol'
import BaseClient from "./BaseClient"
import keygen from './keygen'
import addressFromPublicKey from './addressFromPublicKey'
import base58 from './base58'
interface WalletClient {
    wallet: { name: string, privateKey: Buffer, publicKey: Buffer, address: Buffer }
}
class WalletClient extends BaseClient {
    constructor() {
        super()
        this.wallet = null
    }
    static generate = keygen
    send({ privateKey, to, amount, minerFee, data }: { privateKey: Buffer, to: Buffer | undefined, amount: string | undefined, minerFee: string, data: Buffer | undefined }) {
        const transaction = new Transaction({
            to,
            amount,
            minerFee,
            data
        })
        transaction.sign(privateKey)
        this.blockchain.addTransaction(transaction)
        this.node.broadcastAndStoreDataHash(protocol.constructDataBuffer('transaction', transaction))
        return transaction
    }
    import(wallet: { name: string, privateKey: Buffer }) {
        const ec = new elliptic.ec('secp256k1')
        const key = ec.keyFromPrivate(wallet.privateKey)
        const pubPoint = key.getPublic()
        const publicKey = Buffer.from(pubPoint.encode())
        const address = addressFromPublicKey(publicKey)
        this.wallet = {
            ...wallet,
            publicKey,
            address
        }
    }
    async balance(address: string | undefined = undefined) {
        if (address) return await this.blockchain.getBalanceOfAddress(base58.decode(address))
        else return await this.blockchain.getBalanceOfAddress(this.wallet.address)
    }
    async transactions(address: string | undefined = undefined) {
        if (address) return await this.blockchain.getTransactionsOfAddress(base58.decode(address))
        else return await this.blockchain.getTransactionsOfAddress(this.wallet.address)
    }
}
export default WalletClient