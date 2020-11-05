import Transaction from './Transaction'
import FullNode from './FullNode'
import Node from './Node'
import * as crypto from 'crypto'
import base58 from '../function/base58'
interface Wallet {
    wallet: { name: string, address: string, secret: string }
}
class Wallet extends FullNode {
    constructor() {
        super()
    }
    async balance(address: string = undefined) {
        if (address) return await this.blockchain.getBalanceOfAddress(address)
        else return await this.blockchain.getBalanceOfAddress(this.wallet.address)
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
    import(wallet: { name: string, address: string, secret: string }) {
        this.wallet = wallet
    }
    generate() {
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
}
export default Wallet