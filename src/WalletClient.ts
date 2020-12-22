import * as elliptic from 'elliptic'
import Transaction from './Transaction'
import protocol from './protocol'
import BaseClient from "./BaseClient"
import addressFromPublicKey from './addressFromPublicKey'
import base58 from './base58'
import * as config from '../config.json'
interface WalletClient {
    wallet: { name: string, privateKey: Buffer, publicKey: Buffer, address: Buffer, words: Array<string> }
}
class WalletClient extends BaseClient {
    constructor() {
        super()
        this.wallet = null
    }
    send({ privateKey, to, amount, minerFee, data }: { privateKey: Buffer, to: Buffer | undefined, amount: string | undefined, minerFee: string, data: Buffer | undefined }) {
        const transaction = new Transaction({
            to,
            amount,
            minerFee,
            data,
            timestamp: Date.now()
        })
        transaction.sign(privateKey)
        this.blockchain.addTransaction(transaction)
        for (let i = 0; i < config.wallet.timesToRepeatBroadcastTransaction; i++) {
            setTimeout(() => {
                this.node.broadcast(protocol.constructDataBuffer('transaction', Transaction.minify(transaction)))
            }, Math.pow(i, 2) * 1000)
        }
        return transaction
    }
    import(wallet: { name: string, privateKey: Buffer, words: Array<string> }) {
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
        if (address) return (await this.blockchain.getTransactionsOfAddress(base58.decode(address))).transactions
        else return (await this.blockchain.getTransactionsOfAddress(this.wallet.address)).transactions
    }
}
export default WalletClient