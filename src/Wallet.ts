import * as crypto from 'crypto'
import * as events from 'events'
import Transaction from './Transaction'
import TCPNetworkNode from './TCPNetworkNode'
import base58 from './base58'
import Blockchain from './Blockchain'
import protocol from './protocol'
interface Wallet {
    wallet: { name: string, address: string, secret: string }
    blockchain: Blockchain
    node: TCPNetworkNode
}
class Wallet extends events.EventEmitter {
    constructor() {
        super()
        this.blockchain = new Blockchain()
        this.node = new TCPNetworkNode()
        this.node.on('block', block => {
            this.blockchain.addBlock(block)
        })
        this.node.on('transaction', transaction => {
            this.blockchain.addTransaction(transaction)
        })
        this.node.on('node', data => {
            this.node.connectToNetwork([ data.data ])
        })
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
        this.node.broadcastAndStoreDataHash(protocol.constructDataBuffer('transction', transaction))
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