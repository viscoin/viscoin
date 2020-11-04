import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import * as prompts from 'prompts'
import * as chalk from 'chalk'
import * as keys from './keys.json'
import * as nodes from './nodes.json'
import * as net from 'net'
import Wallet from './src/class/Wallet'
import base58 from './src/function/base58'

const wallet = new Wallet()
wallet.setKeys(keys)
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
                { title: 'Exit', description: 'Exits', value: commands.exit },
                { title: 'Generate', description: 'Generates new wallet', value: commands.generate },
                { title: 'Network', description: 'View network nodes', value: commands.network },
                { title: 'Settings', description: 'Configure wallet settings', value: commands.settings }
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
    exit: () => {
        wallet.closeNetworkNode()
        wallet.disconnectFromNetwork()
        process.exit(0)
    },
    generate: async () => {
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
        console.log(`${chalk.whiteBright(chalk.bold('Address'))}     (${chalk.greenBright('SHARE')})  ${chalk.blueBright(address)}`)
        console.log(`${chalk.whiteBright(chalk.bold('Private key'))} (${chalk.redBright('SECRET')}) ${chalk.blueBright(secret)}`)
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
                { title: 'Password', description: 'Configure password options for wallet', value: commands.password },
                { title: 'Nodes', description: 'Configure network nodes for wallet', value: commands.nodes },
                { title: 'Back', value: commands.commands }
            ]
        })
        if (typeof res.value !== 'function') return commands.commands()
        res.value()
    },
    password: async () => {
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Command',
            choices: [
                { title: 'Enable', description: 'Enable password encryption for wallet', value: commands.enable_password },
                { title: 'Update', description: 'Update password', value: commands.update_password },
                { title: 'Back', value: commands.settings }
            ]
        })
        if (typeof res.value !== 'function') return commands.commands()
        res.value()
    },
    enable_password: async () => {
        const res = await prompts({
            type: 'toggle',
            name: 'enable',
            message: 'Enable password',
            initial: false,
            active: 'yes',
            inactive: 'no'
        })
        console.log(res)
        if (res.enable) {
            console.log(chalk.greenBright('Successfully enabled password encryption for wallet'))
        }
        else {
            console.log(chalk.yellowBright('Successfully disabled password encryption for wallet'))
        }
        return commands.password()
    },
    update_password: async () => {
        let password = ''
        const res = await prompts([
            {
                type: 'password',
                name: 'new_password',
                message: 'New password',
                validate: new_password => {
                    password = new_password
                    // calculate strength of password
                    return true
                }
            },
            {
                type: 'password',
                name: 'confirm_new_password',
                message: 'Confirm new password',
                validate: confirm_new_password => {
                    // compare passwords
                    return password === confirm_new_password ? true : 'Passwords do not match'
                }
            }
        ])
        console.log(chalk.greenBright('Successfully updated password'))
        commands.password()
    },
    nodes: () => {
        console.log('nodes')
        commands.commands()
    }
}
commands.commands()