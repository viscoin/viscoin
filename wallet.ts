import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import * as prompts from 'prompts'
import * as chalk from 'chalk'
import * as nodes from './nodes.json'
import * as net from 'net'
import * as fs from 'fs'
import Wallet from './src/class/Wallet'
import base58 from './src/function/base58'

const wallet = new Wallet()

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
                { title: 'Exit', description: 'Exits', value: commands.exit },
                { title: 'Generate', description: 'Generates new wallet', value: commands.generate },
                { title: 'Network', description: 'View network nodes', value: commands.network },
                { title: 'Settings', description: 'Configure wallet settings', value: commands.settings },
                { title: 'Wallet', description: 'Select wallet', value: commands.select_wallet }
            ]
        })
        if (typeof res.value !== 'function') return commands.commands()
        res.value()
    },
    info: () => {
        console.log(`${chalk.whiteBright.bold('Name')}                 ${chalk.blueBright(wallet.wallet.name)}`)
        console.log(`${chalk.whiteBright.bold('Address')}     (${chalk.greenBright('SHARE')})  ${chalk.blueBright(wallet.wallet.address)}`)
        console.log(`${chalk.whiteBright.bold('Private key')} (${chalk.redBright('SECRET')}) ${chalk.blueBright(wallet.wallet.secret)}`)
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
                message: (prev, values) => `Total ${parseFloat(values.amount) + parseFloat(values.minerFee)}. Sign and broadcast?`,
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
        }
        commands.commands()
    },
    address: async () => {
        console.log(wallet.wallet.address)
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
    exit: () => {
        wallet.closeNetworkNode()
        wallet.disconnectFromNetwork()
        process.exit(0)
    },
    generate: async () => {
        const { address, secret } = wallet.generate()
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
        if (!save) return commands.commands()
        const { name, passphrase } = await prompts([
            {
                type: 'text',
                name: 'name',
                message: 'Name wallet'
            },
            {
                type: 'password',
                name: 'passphrase',
                message: 'Enter passphrase'
            }
        ])
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(passphrase).digest(), iv)
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
        commands.commands()
    },
    network: () => {
        if (wallet.clientNode.sockets.length) {
            for (const socket of wallet.clientNode.sockets) {
                const info = <net.AddressInfo> socket.address()
                console.log(chalk.whiteBright(`${info.address}${chalk.grey(':')}${chalk.white(info.port)} ${chalk.greenBright('=>')} ${socket.remoteAddress}${chalk.grey(':')}${chalk.blueBright(socket.remotePort)}`))
            }
        }
        else {
            console.log(chalk.redBright('Wallet is disconnected from the network'))
        }
        commands.commands()
    },
    settings: async () => {
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Command',
            choices: [
                { title: 'Nodes', description: 'Configure network nodes for wallet', value: commands.nodes },
                { title: 'Back', value: commands.commands }
            ]
        })
        if (typeof res.value !== 'function') return commands.commands()
        res.value()
    },
    nodes: () => {
        console.log('nodes')
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
                    const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.createHash('sha256').update(passphrase).digest(), data.slice(0, 16))
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
        commands.commands()
    },
    select_wallet: async () => {
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
        wallet.connectToNetwork(nodes)
        commands.select_wallet()
    }
}
commands.init()