import * as elliptic from 'elliptic'
import Transaction from './Transaction'
import addressFromPublicKey from './addressFromPublicKey'
import base58 from './base58'
import HTTPApi from './HTTPApi'
import * as configNetwork from '../config/network.json'
const ec = new elliptic.ec('secp256k1')
interface Wallet {
    name: string
    privateKey: Buffer
    publicKey: Buffer
    address: Buffer
    words: Array<string>
}
class Wallet {
    constructor({ name, privateKey, publicKey, address, words }) {
        if (name) this.name = name
        if (privateKey) this.privateKey = privateKey
        if (publicKey) this.publicKey = publicKey
        if (address) this.address = address
        if (words) this.words = words
    }
    createTransaction({ to, amount, minerFee }: { to: Buffer | undefined, amount: string | undefined, minerFee: string }) {
        const transaction = new Transaction({
            to,
            amount,
            minerFee,
            timestamp: Date.now()
        })
        transaction.sign(this.privateKey)
        return transaction
    }
    static import(wallet: { name: string, privateKey: Buffer, words: Array<string> }) {
        const key = ec.keyFromPrivate(wallet.privateKey)
        const pubPoint = key.getPublic()
        const publicKey = Buffer.from(pubPoint.encode())
        const address = addressFromPublicKey(publicKey)
        const a: any = {
            address,
            publicKey
        }
        for (const b in wallet) {
            if (wallet[b]) a[b] = wallet[b]
        }
        return a
    }
    async balance() {
        return await HTTPApi.getBalanceOfAddress({ host: configNetwork.HTTPApi.address, port: configNetwork.HTTPApi.port }, base58.encode(this.address))
    }
    async transactions() {
        return await HTTPApi.getTransactionsOfAddress({ host: configNetwork.HTTPApi.address, port: configNetwork.HTTPApi.port }, base58.encode(this.address))
    }
}
export default Wallet