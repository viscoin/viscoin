import base58 from './base58'
import addressFromPublicKey from './addressFromPublicKey'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import TCPApi from './TCPApi'
import HTTPApi from './HTTPApi'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import Transaction from './Transaction'
import * as events from 'events'
import { Mongoose } from 'mongoose'
import Address from './Address'

interface PaymentProcessor {
    privateKey: Buffer
    httpApi: {
        port: number
        host: string
    }
    tcpClient: TCPApi['Client']
    confirmations: number
    model_charge: any
    sendBackToMainWallet: boolean
}
class PaymentProcessor extends events.EventEmitter {
    constructor(privateKey: Buffer, confirmations: number, httpApi: { port: number, host: string }, tcpClient: TCPApi['Client'], mongoose: Mongoose, model_charge_options: object, sendBackToMainWallet: boolean) {
        super()
        const options = {
            status: String,
            amount: String,
            privateKey: String,
            created: Number,
            expires: Number,
            payments: Array,
            ...model_charge_options
        }
        this.model_charge = mongoose.model("Charge", new mongoose.Schema(options, { collection: 'charges', versionKey: false }))
        this.privateKey = privateKey
        this.confirmations = confirmations
        this.sendBackToMainWallet = sendBackToMainWallet
        this.httpApi = httpApi
        this.tcpClient = tcpClient
        this.tcpClient.on('block', async block => {
            try {
                const charges = await this.model_charge.find({
                    status: {
                        $in: [ 'NEW', 'PENDING' ]
                    }
                })
                for (const charge of charges) {
                    if (charge.expires < Date.now()) charge.status = 'EXPIRED'
                    else {
                        for (const transaction of block.transactions) {
                            if (charge.address !== base58.encode(transaction.to)) continue
                            charge.payments.push({
                                block: {
                                    hash: block.hash.toString('hex'),
                                    height: block.height
                                },
                                amount: transaction.amount,
                                signature: transaction.signature.toString('hex')
                            })
                            this.emit('charge-pending', charge, block)
                            // if (charge.status === 'NEW') this.emit('charge-pending', charge, block)
                            charge.status = 'PENDING'
                        }
                    }
                    await charge.save()
                }
            }
            catch {}
            try {
                const charges = await this.model_charge.find({ status: 'PENDING' })
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
                    charge.save()
                    this.emit('charge-completed', charge)
                    if (this.sendBackToMainWallet === true) {
                        const { code, transaction } = await this.withdrawAllBalance(charge.privateKey)
                        this.emit('withdraw-all-balance', code, transaction)
                    }
                }
            }
            catch {}
        })
        this.tcpClient.on('transaction', async transaction => {
            try {
                const to = base58.encode(transaction.to)
                const charge = await this.model_charge.findOne({ address: to, status: 'NEW' })
                if (!charge) return
                charge.status = 'PENDING'
                await charge.save()
                this.emit('charge-pending', charge)
            }
            catch {}
        })
    }
    address() {
        return addressFromPublicKey(publicKeyFromPrivateKey(this.privateKey))
    }
    async getNewAddress() {
        const charges = await this.model_charge.countDocuments({})
        const buffer = Buffer.alloc(4)
        buffer.writeUInt32BE(charges)
        const privateKey = Buffer.concat([
            this.privateKey,
            buffer
        ])
        return {
            address: base58.encode(Address.convertToChecksumAddress(addressFromPublicKey(publicKeyFromPrivateKey(privateKey)))),
            privateKey: base58.encode(privateKey)
        }
    }
    async createCharge(amount: string, expiresAfter: number, data: object) {
        const { address, privateKey } = await this.getNewAddress()
        const charge = await new this.model_charge({
            status: 'NEW',
            amount,
            address,
            privateKey,
            created: Date.now(),
            expires: Date.now() + expiresAfter,
            payments: [],
            ...data
        }).save()
        this.emit('charge-new', charge)
        return charge
    }
    async getCharge(query: object) {
        const charge = await this.model_charge.findOne({ status: { $in: [ 'NEW', 'PENDING' ] }, ...query })
        if (!charge) return null
        if (charge.expires < Date.now()) {
            charge.status = 'EXPIRED'
            charge.save()
            return null
        }
        return charge
    }
    async cancelCharge(query: object) {
        try {
            const charge = await this.model_charge.findOne({ status: { $in: [ 'NEW', 'PENDING' ] }, ...query })
            if (!charge) return false
            charge.status = 'CANCELED'
            await charge.save()
            this.emit('charge-canceled', charge)
            return true
        }
        catch {}
    }
    async withdrawAllBalance(privateKey: string, maxFee: bigint = 0n) {
        try {
            const address = base58.encode(addressFromPublicKey(publicKeyFromPrivateKey(base58.decode(privateKey))))
            const balance = await HTTPApi.getBalanceOfAddress(this.httpApi, address)
            if (!balance) return
            const fee = await this.getFee()
            const minerFee = !fee?.avg ? 1n : fee.avg
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
            if (transaction.isValid() !== 0) return {
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
            if (transaction.isValid() !== 0) return {
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
                min: 0n
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