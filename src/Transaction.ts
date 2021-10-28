import * as crypto from 'crypto'
import addressFromPublicKey from './addressFromPublicKey'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import * as secp256k1 from 'secp256k1'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import * as config_minify from '../config/minify.json'
import * as config_core from '../config/core.json'
interface Transaction {
    from: Buffer
    to: Buffer
    timestamp: number
    amount: string
    minerFee: string
    signature: Buffer,
    recoveryParam: number
}
class Transaction {
    constructor({ from = undefined, to = undefined, amount = undefined, timestamp = undefined, minerFee = undefined, signature = undefined, recoveryParam = undefined }) {
        if (timestamp) this.timestamp = timestamp
        if (typeof minerFee === 'string') this.minerFee = minerFee
        if (from instanceof Buffer) this.from = from
        else if (from) this.from = Buffer.from(from, 'binary')
        if (typeof amount === 'string') {
            if (to instanceof Buffer) this.to = to
            else if (to) this.to = Buffer.from(to, 'binary')
            this.amount = amount
        }
        if (typeof recoveryParam === 'number') {
            if (signature instanceof Buffer) this.signature = signature
            else if (signature) this.signature = Buffer.from(signature, 'binary')
            this.recoveryParam = recoveryParam
        }
    }
    static minify(input: Transaction) {
        const output: object = {}
        for (const property in input) {
            if (config_minify.transaction[property] !== undefined) {
                if (input[property] instanceof Buffer) output[config_minify.transaction[property]] = input[property].toString('binary')
                else output[config_minify.transaction[property]] = input[property]
            }
        }
        return output
    }
    static beautify(input) {
        const output = {}
            for (const property in input) {
                for (const _property in config_minify.transaction) {
                    if (property === config_minify.transaction[_property]) {
                        output[_property] = input[property]
                    }
                }
            }
        return <any> output
    }    
    static calculateHash(transaction: Transaction) {
        let a = parseBigInt(transaction.amount).toString(16)
        if (a.length % 2 !== 0) a = '0' + a
        // if transaction is miner reward
        if (!transaction.from) {
            return crypto.createHash('sha256').update(Buffer.concat([
                transaction.to,
                Buffer.from(a, 'hex')
            ])).digest()
        }
        let t = transaction.timestamp.toString(16)
        if (t.length % 2 !== 0) t = '0' + t
        let m = parseBigInt(transaction.minerFee).toString(16)
        if (m.length % 2 !== 0) m = '0' + m
        return crypto.createHash('sha256').update(Buffer.concat([
            transaction.from,
            transaction.to,
            Buffer.from(t, 'hex'),
            Buffer.from(a, 'hex'),
            Buffer.from(m, 'hex')
        ])).digest()
    }
    sign(privateKey: Buffer) {
        this.from = addressFromPublicKey(publicKeyFromPrivateKey(privateKey))
        const hash = Transaction.calculateHash(this)
        const signature = secp256k1.ecdsaSign(hash, privateKey)
        this.signature = Buffer.from(signature.signature)
        this.recoveryParam = signature.recid
    }
    isValid() {
        try {
            // from
            if (!(this.from instanceof Buffer)) return 0x8000000000000n
            if (Buffer.byteLength(this.from) !== 20) return 0x10000000000000n
            // to
            if (!(this.to instanceof Buffer)) return 0x20000000000000n
            if (Buffer.byteLength(this.to) !== 20) return 0x40000000000000n
            // sending to self
            if (this.from.equals(this.to)) return 0x80000000000000n
            // signature
            if (!(this.signature instanceof Buffer)) return 0x100000000000000n
            if (Buffer.byteLength(this.signature) !== 64) return 0x200000000000000n
            // recoveryParam
            if (!Number.isSafeInteger(this.recoveryParam)) return 0x400000000000000n
            if (this.recoveryParam >> 2) return 0x800000000000000n
            // amount
            const amount = parseBigInt(this.amount)
            if (amount === null) return 0x1000000000000000n
            if (amount <= 0n) return 0x2000000000000000n
            if (beautifyBigInt(amount) !== this.amount) return 0x4000000000000000n
            // minerFee
            const minerFee = parseBigInt(this.minerFee)
            if (minerFee === null) return 0x8000000000000000n
            if (minerFee <= 0n) return 0x10000000000000000n
            if (beautifyBigInt(minerFee) !== this.minerFee) return 0x20000000000000000n
            // timestamp
            if (!Number.isSafeInteger(this.timestamp)) return 0x40000000000000000n
            if (this.timestamp <= config_core.genesisBlockTimestamp) return 0x80000000000000000n
            if (this.timestamp > Date.now()) return 0x100000000000000000n
            // verify
            const hash = Transaction.calculateHash(this)
            const publicKey = secp256k1.ecdsaRecover(this.signature, this.recoveryParam, hash, false)
            const address = addressFromPublicKey(Buffer.from(publicKey))
            if (!address.equals(this.from)) return 0x200000000000000000n
            return 0x0n
        }
        catch {
            return 0x400000000000000000n
        }
    }
    byteFee() {
        const bytes = BigInt(Buffer.byteLength(JSON.stringify(Transaction.minify(this))))
        const fee = parseBigInt(this.minerFee)
        if (fee === 0n) return {
            bigint: 0n,
            remainder: 0n
        }
        const bigint = fee / bytes
        const remainder = fee % bytes
        return {
            bigint,
            remainder
        }
    }
}
export default Transaction