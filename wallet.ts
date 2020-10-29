import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import * as prompts from 'prompts'
import * as baseX from 'base-x'
import * as chalk from 'chalk'
import * as keys from './keys.json'
import * as nodes from './nodes.json'
import Wallet from './src/class/Wallet'
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const base58 = baseX(BASE58)

const wallet = new Wallet(keys)
wallet.connectToNetwork(nodes)

const commands = {
    commands: async () => {
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Command',
            choices: [
                { title: 'Send', description: 'Send money to address', value: commands.send },
                { title: 'Address', description: 'Get wallet address', value: commands.address },
                { title: 'Balance', description: 'Get balance of wallet address', value: commands.balance },
                { title: 'Commands', description: 'Lists all avaliable commands', value: commands.commands },
                { title: 'Exit', description: 'Exits', value: commands.exit },
                { title: 'Generate', description: 'Generates new wallet', value: commands.generate }
            ]
        })
        if (typeof res.value !== 'function') return commands.commands()
        res.value()
    },
    send: async () => {
        const res = await prompts([
            {
                type: 'text',
                name: 'toAddress',
                message: 'Address',
                validate: toAddress => {
                    try {
                        crypto.createPublicKey({
                            key: base58.decode(toAddress),
                            type: 'spki',
                            format: 'der'
                        })
                        return true
                    } catch {
                        return 'Invalid address'
                    }
                }
            },
            {
                type: 'text',
                name: 'amount',
                message: 'Amount',
                validate: amount => isNaN(parseFloat(amount)) ? 'Invalid amount' : true
            },
            {
                type: 'text',
                name: 'minerFee',
                message: 'Miners fee',
                validate: minerFee => isNaN(parseFloat(minerFee)) ? 'Invalid amount' : true
            },
            {
                type: 'toggle',
                name: 'confirm',
                message: (prev, values) => `Total ${parseFloat(values.amount) + parseFloat(values.minerFee)}. Sign and broadcast?`,
                initial: false,
                active: 'yes',
                inactive: 'no'
            }
        ])
        if (res.confirm) {
            const transaction = await wallet.send({
                ...res,
                publicKey: keys[0].publicKey,
                privateKey: keys[0].privateKey
            })
            console.log(transaction)
        }
        commands.commands()
    },
    address: async () => {
        const res = await prompts({
            type: 'autocomplete',
            name: 'address',
            message: 'Addresses',
            choices: wallet.keys.map(e => {
                return {
                    title: e.publicKey
                }
            })
        })
        console.log(res.address)
        commands.commands()
    },
    balance: async () => {
        const res = await prompts({
            type: 'text',
            name: 'address',
            message: 'Address',
            validate: address => {
                if (!address) return true
                try {
                    crypto.createPublicKey({
                        key: base58.decode(address),
                        type: 'spki',
                        format: 'der'
                    })
                    return true
                } catch {
                    return 'Invalid address'
                }
            }
        })
        console.log(await wallet.balance(res.address))
        commands.commands()
    },
    exit: () => {},
    generate: async () => {
        const key = crypto.generateKeyPairSync('ed25519')
        const address = base58.encode(key.publicKey.export({
            type: 'spki',
            format: 'der'
        }))
        const secret = base58.encode(key.privateKey.export({
            type: 'pkcs8',
            format: 'der'
        }))
        console.log(`${chalk.whiteBright(chalk.bold('Address'))} (${chalk.greenBright('SHARE')}): ${chalk.blueBright(address)}`)
        console.log(`${chalk.whiteBright(chalk.bold('Private key'))} (${chalk.redBright('SECRET')}): ${chalk.blueBright(secret)}`)
        commands.commands()
    }
}
commands.commands()