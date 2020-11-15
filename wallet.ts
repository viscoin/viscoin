import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import * as prompts from 'prompts'
import * as chalk from 'chalk'
import * as nodes from './nodes.json'
import * as net from 'net'
import * as fs from 'fs'
import WalletClient from './src/WalletClient'
import base58 from './src/base58'
import customHash from './src/customHash'

const wallet = new WalletClient()

const commands = {
    commands: async () => {
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Command',
            choices: [
                { title: 'Info', description: 'View details about your current wallet', value: commands.info },
                { title: 'Send', description: 'Send money to address', value: commands.send },
                { title: 'Address', description: 'Get wallet address', value: commands.address },
                { title: 'Balance', description: 'Get balance of wallet address', value: commands.balance },
                { title: 'Generate', description: 'Generates new wallet', value: commands.generate },
                { title: 'Network', description: 'View network nodes', value: commands.network },
                { title: 'Wallet', description: 'Select wallet', value: commands.select_wallet },
                { title: 'Exit', description: 'Exits', value: commands.exit }
            ]
        })
        if (typeof res.value !== 'function') return commands.commands()
        res.value()
    },
    info: async () => {
        console.log(`${chalk.whiteBright.bold('Name')}                 ${chalk.blueBright(wallet.wallet.name)}`)
        console.log(`${chalk.whiteBright.bold('Address')}     (${chalk.greenBright('SHARE')})  ${chalk.blueBright(wallet.wallet.address)}`)
        console.log(`${chalk.whiteBright.bold('Private key')} (${chalk.redBright('SECRET')}) ${chalk.blueBright(wallet.wallet.secret)}`)
        await commands.pause()
        console.clear()
        commands.commands()
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
                message: (prev, values) => `Sum: ${values.amount} + ${values.minerFee} = ${parseFloat(values.amount) + parseFloat(values.minerFee)}\nSign and broadcast?`,
                initial: false,
                active: 'yes',
                inactive: 'no'
            }
        ])
        if (res.confirm) {
            const transaction = await wallet.send({
                ...res,
                ...wallet.wallet
            })
            console.log(transaction)
            await commands.pause()
        }
        console.clear()
        commands.commands()
    },
    address: async () => {
        console.log(chalk.blueBright(wallet.wallet.address))
        await commands.pause()
        console.clear()
        commands.commands()
    },
    balance: async () => {
        const res = await prompts([
            {
                type: 'toggle',
                name: 'this',
                message: 'This wallet?',
                initial: true,
                active: 'yes',
                inactive: 'no'
            },
            {
                type: prev => prev === true ? null : 'text',
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
            }
        ])
        console.log(chalk.yellowBright(await wallet.balance(res.address)))
        await commands.pause()
        console.clear()
        commands.commands()
    },
    exit: () => {
        console.clear()
        process.exit(0)
    },
    generate: async () => {
        const { address, secret } = WalletClient.generate()
        console.log(`${chalk.whiteBright.bold('Address')}     (${chalk.greenBright('SHARE')})  ${chalk.blueBright(address)}`)
        console.log(`${chalk.whiteBright.bold('Private key')} (${chalk.redBright('SECRET')}) ${chalk.blueBright(secret)}`)
        const { save } = await prompts({
            type: 'toggle',
            name: 'save',
            message: 'Save key?',
            initial: false,
            active: 'yes',
            inactive: 'no'
        })
        if (!save) {
            console.clear()
            return commands.commands()
        }
        const { name, passphrase } = await prompts([
            {
                type: 'text',
                name: 'name',
                message: 'Name wallet',
                validate: name => {
                    const exists = fs.existsSync(`./wallets/${name}.wallet`)
                    return exists ? 'Wallet already exists' : true
                }
            },
            {
                type: 'password',
                name: 'passphrase',
                message: 'Enter passphrase'
            }
        ])
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-cbc', customHash(passphrase), iv)
        if (!fs.existsSync('./wallets')) fs.mkdirSync('./wallets')
        fs.writeFileSync(`./wallets/${name}.wallet`, Buffer.concat([
            iv,
            cipher.update(JSON.stringify({
                address,
                secret
            })),
            cipher.final()
        ]))
        wallet.import({
            name,
            address,
            secret
        })
        console.clear()
        commands.commands()
    },
    network: async () => {
        if (wallet.node.sockets.length) {
            for (const socket of wallet.node.sockets) {
                const info = <net.AddressInfo> socket.address()
                console.log(chalk.whiteBright(`${info.address}${chalk.grey(':')}${chalk.white(info.port)} ${chalk.greenBright('=>')} ${socket.remoteAddress}${chalk.grey(':')}${chalk.blueBright(socket.remotePort)}`))
            }
        }
        else {
            console.log(chalk.redBright('Wallet is disconnected from the network'))
        }
        await commands.pause()
        console.clear()
        commands.commands()
    },
    load_wallet: async (name) => {
        if (!fs.existsSync(`./wallets/${name}`)) {
            console.log(chalk.redBright('Wallet not found'))
            return commands.select_wallet()
        }
        const data = fs.readFileSync(`./wallets/${name}`)
        await prompts({
            type: 'password',
            name: 'passphrase',
            message: 'Enter passphrase',
            validate: passphrase => {
                try {
                    const decipher = crypto.createDecipheriv('aes-256-cbc', customHash(passphrase), data.slice(0, 16))
                    wallet.import({
                        name,
                        ...JSON.parse(String(Buffer.concat([
                            decipher.update(data.slice(16)),
                            decipher.final()
                        ])))
                    })
                    return true
                } catch { return 'Failed to decrypt' }
            }
        })
        console.clear()
        commands.commands()
    },
    select_wallet: async () => {
        console.clear()
        if (!fs.existsSync('./wallets')) fs.mkdirSync('./wallets')
        const files = fs.readdirSync('./wallets')
        if (!files.length) return commands.generate()
        const choices = files.map(e => {
            return {
                title: e,
                value: e
            }
        })
        const { name } = await prompts({
            type: 'autocomplete',
            name: 'name',
            message: 'Select wallet',
            choices
        })
        commands.load_wallet(name)
    },
    init: () => {
        wallet.node.connectToNetwork(nodes)
        commands.select_wallet()
    },
    pause: () => {
        return new Promise(resolve => {
            process.stdin.setRawMode(true)
            process.stdin.resume()
            process.stdin.once('data', () => resolve())
        })
    }
}
commands.init()