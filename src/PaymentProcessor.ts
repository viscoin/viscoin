import base58 from './base58'
import addressFromPublicKey from './addressFromPublicKey'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import TCPApi from './TCPApi'
import HTTPApi from './HTTPApi'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import Transaction from './Transaction'
import * as events from 'events'
import Address from './Address'
import keygen from './keygen'

interface PaymentProcessor {
    db: any
    privateKey: Buffer
    confirmations: number
    sendBackToMainWallet: boolean
    httpApi: {
        port: number
        host: string
    }
    tcpClient: TCPApi['Client']
}
class PaymentProcessor extends events.EventEmitter {
    constructor(db, privateKey: Buffer, confirmations: number, sendBackToMainWallet: boolean, httpApi: { port: number, host: string }, tcpClient: TCPApi['Client']) {
        super()
        this.db = db
        this.privateKey = privateKey
        this.confirmations = confirmations
        this.sendBackToMainWallet = sendBackToMainWallet
        this.httpApi = httpApi
        this.tcpClient = tcpClient
        this.tcpClient.on('block', block => {
            let charges = []
            const stream = this.db.createReadStream()
            stream.on('data', data => {
                const charge = {
                    address: data.key,
                    ...data.value
                }
                if ([ 'NEW', 'PENDING' ].includes(charge.status)) charges.push(charge)
            })
            stream.on('end', async () => {
                for (const charge of charges) {
                    if (charge.expires < Date.now()) charge.status = 'EXPIRED'
                    else {
                        for (const transaction of block.transactions) {
                            if (charge.address !== Address.toString(transaction.to)) continue
                            charge.payments.push({
                                block: {
                                    hash: block.hash.toString('hex'),
                                    height: block.height
                                },
                                amount: transaction.amount,
                                signature: transaction.signature.toString('hex')
                            })
                            this.emit('charge-pending', charge, block)
                            charge.status = 'PENDING'
                        }
                    }
                    await this.putCharge(charge)
                }
                charges = charges.filter(e => e.status === 'PENDING')
                for (const charge of charges) {
                    charge.payments = charge.payments.filter(async payment => await HTTPApi.getBlockByHash(this.httpApi, Buffer.from(payment.block.hash, 'hex')))
                    let sum = 0n,
                    height = 0
                    for (const payment of charge.payments) {
                        sum += parseBigInt(payment.amount)
                        if (height < payment.block.height) height = payment.block.height
                        if (sum >= parseBigInt(charge.amount)) break
                    }
                    if (height > block.height - (this.confirmations - 1)) return
                    if (sum < parseBigInt(charge.amount)) return
                    charge.status = 'COMPLETED'
                    await this.putCharge(charge)
                    this.emit('charge-completed', charge)
                    if (this.sendBackToMainWallet === true) {
                        const { code, transaction } = await this.withdrawAllBalance(charge.privateKey)
                        this.emit('withdraw-all-balance', code, transaction)
                    }
                }
            })
        })
        this.tcpClient.on('transaction', async transaction => {
            try {
                const to = Address.toString(transaction.to)
                const charge = await this.getCharge(to)
                if (!charge) return
                charge.status = 'PENDING'
                await this.putCharge(charge)
                this.emit('charge-pending', charge)
            }
            catch {}
        })
    }
    address() {
        return addressFromPublicKey(publicKeyFromPrivateKey(this.privateKey))
    }
    async getNewAddress() {
        const privateKey = keygen()
        return {
            address: Address.toString(Address.fromPrivateKey(privateKey)),
            privateKey: base58.encode(privateKey)
        }
    }
    async createCharge(amount: string, expiresAfter: number, data: object) {
        const { address, privateKey } = await this.getNewAddress()
        const charge = {
            status: 'NEW',
            amount,
            address,
            privateKey,
            created: Date.now(),
            expires: Date.now() + expiresAfter,
            payments: [],
            ...data
        }
        await this.putCharge(charge)
        this.emit('charge-new', charge)
        return charge
    }
    async putCharge(charge: { address: string }) {
        await this.db.put(charge.address, charge)
    }
    async getCharge(address: string) {
        let charge = await this.db.get(address)
        if (!charge) return null
        if (![ 'NEW', 'PENDING' ].includes(charge.status)) return null
        if (charge.expires < Date.now()) {
            charge.status = 'EXPIRED'
            await this.putCharge(charge)
            return null
        }
        return charge
    }
    async cancelCharge(address: string) {
        const charge = await this.getCharge(address)
        if (!charge) return false
        charge.status = 'CANCELED'
        await this.putCharge(charge)
        this.emit('charge-canceled', charge)
        return true
    }
    async withdrawAllBalance(privateKey: string, maxFee: bigint = 0n) {
        try {
            const address = Address.toString(Address.fromPrivateKey(base58.decode(privateKey)))
            const balance = await HTTPApi.getBalanceOfAddress(this.httpApi, address)
            if (!balance) return
            const fee = await this.getFee()
            let minerFee = !fee?.avg ? 1n : fee.avg
            if (fee.transactions < 10) minerFee = 1n
            if (maxFee !== 0n && minerFee > maxFee) return {
                code: null,
                transaction: null
            }
            const to = this.address()
            const amount = beautifyBigInt(parseBigInt(balance) - minerFee)
            const transaction = new Transaction({
                to,
                amount,
                minerFee: beautifyBigInt(minerFee),
                timestamp: Date.now()
            })
            transaction.sign(base58.decode(privateKey))
            if (!transaction.isValid()) return {
                code: null,
                transaction
            }
            return {
                code: await HTTPApi.send(this.httpApi, transaction),
                transaction
            }
        }
        catch {
            return {
                code: null,
                transaction: null
            }
        }
    }
    async send(address: string, amount: string, maxFee: bigint = 0n) {
        try {
            const fee = await this.getFee()
            const minerFee = !fee?.avg ? 1n : fee.avg
            if (maxFee !== 0n && minerFee > maxFee) return {
                code: null,
                transaction: null
            }
            const to = base58.decode(address)
            const transaction = new Transaction({
                to,
                amount,
                minerFee: beautifyBigInt(minerFee),
                timestamp: Date.now()
            })
            transaction.sign(base58.decode(process.env.privateKey))
            if (!transaction.isValid()) return {
                code: null,
                transaction
            }
            return {
                code: await HTTPApi.send(this.httpApi, transaction),
                transaction
            }
        }
        catch {
            return {
                code: null,
                transaction: null
            }
        }
    }
    async getFee() {
        try {
            const transactions = await HTTPApi.getPendingTransactions(this.httpApi)
            const fee = {
                max: 0n,
                avg: 0n,
                min: 0n,
                transactions: transactions.length
            }
            for (const transaction of transactions) {
                const minerFee = parseBigInt(transaction.minerFee)
                fee.avg += minerFee
                if (fee.max === 0n) fee.max = minerFee
                if (fee.min === 0n) fee.min = minerFee
                if (minerFee > fee.max) fee.max = minerFee
                if (minerFee < fee.min) fee.min = minerFee
            }
            if (transactions.length !== 0) fee.avg /= BigInt(transactions.length)
            return fee
        }
        catch {
            return null
        }
    }
}
export default PaymentProcessor