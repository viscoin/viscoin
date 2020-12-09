import mongoose from './src/mongoose/mongoose'
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
import * as path from 'path'
import * as config from './config.json'

const wallet = new WalletClient()

const functions = {
    save_wallet: (address: string, secret: string, name: string, passphrase: string) => {
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
    },
    log_numbers: (value) => {
        console.log(chalk.yellowBright(value))
        console.log(chalk.cyanBright(`2^${Math.log2(value)}`))
        console.log(chalk.blueBright(`10^${Math.log10(value)}`))
    }
}

const commands = {
    commands: async () => {
        let choices: Array<{ title: string, description: string, value: Function }> = [
            { title: 'Wallet', description: 'Select wallet', value: commands.select_wallet },
            { title: 'Network', description: 'View network nodes', value: commands.network },
            { title: 'Generate', description: 'Generates new wallet', value: commands.generate },
            { title: 'Import', description: 'Import a new wallet', value: commands.import_wallet },
            { title: 'Blockchain', description: 'View statistics about the blockchain', value: commands.blockchain },
            { title: 'Exit', description: 'Exits', value: commands.exit }
        ]
        if (wallet.wallet) {
            choices = [
                { title: 'Address', description: 'Get wallet address', value: commands.address },
                { title: 'Balance', description: 'Get balance of wallet address', value: commands.balance },
                { title: 'Send', description: 'Send money to address', value: commands.send },
                { title: 'Transactions', description: 'Lists all transactions', value: commands.transactions },
                { title: 'Info', description: 'View details about your current wallet', value: commands.info },
                { title: 'Secret', description: 'Get wallet secret', value: commands.secret },
                ...choices
            ]
            console.log(chalk.grey(path.join(__dirname, 'wallets', chalk.blueBright(`${wallet.wallet.name}.wallet`))))
        }
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Command',
            choices
        })
        if (typeof res.value !== 'function') {
            console.clear()
            return commands.commands()
        }
        res.value()
    },
    blockchain: async () => {
        const choices: Array<{ title: string, description: string, value: Function }> = [
            { title: 'Latest Blocks', description: 'Info about the latest blocks', value: commands.latestBlocks },
            { title: 'Work', description: 'Estimate how much work has been put into the blockchain', value: commands.estimate_work },
            { title: 'Supply', description: 'Total circumlating supply', value: commands.circumlatingSupply },
            { title: 'Transactions', description: 'Total transactions made on blockchain', value: commands.totalTransactions },
            { title: 'Height', description: 'Height of blockchain', value: commands.height },
            { title: 'Difficulty', description: 'Current difficulty', value: commands.difficulty },
            { title: 'Validate', description: 'Validates integrity of blockchain', value: commands.isValid }
        ]
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Blockchain',
            choices
        })
        if (typeof res.value !== 'function') {
            console.clear()
            return commands.commands()
        }
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
                name: 'to',
                message: 'Address',
                validate: to => {
                    try {
                        crypto.createPublicKey({
                            key: base58.decode(to),
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
    secret: async () => {
        console.log(chalk.redBright(wallet.wallet.secret))
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
        wallet.wallet = null
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
        if (passphrase === undefined || passphrase === undefined) {
            console.clear()
            return commands.commands()
        }
        functions.save_wallet(address, secret, name, passphrase)
        wallet.import({
            name,
            address,
            secret
        })
        console.clear()
        commands.commands()
    },
    network: async () => {
        if (wallet.node.sockets.filter(e => e !== undefined).length) {
            for (const socket of wallet.node.sockets) {
                if (!socket) continue
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
        if (!fs.existsSync(`./wallets/${name}.wallet`)) {
            console.log(chalk.redBright('Wallet not found'))
            return commands.select_wallet()
        }
        const data = fs.readFileSync(`./wallets/${name}.wallet`)
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
        wallet.wallet = null
        console.clear()
        if (!fs.existsSync('./wallets')) fs.mkdirSync('./wallets')
        let files = fs.readdirSync('./wallets')
        files = files.filter(e => e.endsWith('.wallet'))
        if (!files.length) {
            console.log(chalk.redBright('No stored wallets found'))
            await commands.pause()
            console.clear()
            return commands.commands()
        }
        const choices = files.map(e => {
            return {
                title: e,
                value: e.slice(0, e.length - '.wallet'.length)
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
        commands.commands()
    },
    pause: () => {
        return new Promise(resolve => {
            process.stdin.setRawMode(true)
            process.stdin.resume()
            process.stdin.once('data', () => resolve())
        })
    },
    import_wallet: async () => {
        const { address, secret, name, passphrase } = await prompts([
            {
                type: 'text',
                name: 'address',
                message: 'Address',
                validate: address => {
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
            },
            {
                type: 'text',
                name: 'secret',
                message: 'Secret',
                validate: secret => {
                    try {
                        crypto.createPrivateKey({
                            key: base58.decode(secret),
                            type: 'pkcs8',
                            format: 'der'
                        })
                        return true
                    } catch {
                        return 'Invalid secret'
                    }
                }
            },
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
        if (address === undefined || secret === undefined || name === undefined || passphrase === undefined) {
            console.clear()
            return commands.commands()
        }
        functions.save_wallet(address, secret, name, passphrase)
        wallet.import({
            name,
            address,
            secret
        })
        console.clear()
        commands.commands()
    },
    transactions: async () => {
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
        const transactions = (await wallet.transactions(res.address)).sort((a, b) => a.timestamp - b.timestamp)
        for (const transaction of transactions) {
            const date = chalk.magentaBright(new Date(transaction.timestamp).toLocaleTimeString()),
            arrow = chalk.magentaBright('→')
            if (transaction.from === wallet.wallet.address) transaction.from = chalk.blueBright(transaction.from)
            if (transaction.to === wallet.wallet.address) transaction.to = chalk.blueBright(transaction.to)
            if (transaction.from === config.mining.reward.from) console.log(`${date} ${transaction.to} ${chalk.greenBright.bold(`+${transaction.amount}`)}`)
            else console.log(`${date} ${transaction.from} ${chalk.redBright.bold(`-${transaction.amount}`)} ${arrow} ${transaction.to} ${chalk.greenBright.bold(`+${transaction.amount - transaction.minerFee}`)}`)
        }
        await commands.pause()
        console.clear()
        commands.commands()
    },
    estimate_work: async () => {
        const work = await wallet.blockchain.getWork()
        functions.log_numbers(work)
        await commands.pause()
        console.clear()
        commands.commands()
    },
    circumlatingSupply: async () => {
        const supply = await wallet.blockchain.getCircumlatingSupply()
        functions.log_numbers(supply)
        await commands.pause()
        console.clear()
        commands.commands()
    },
    totalTransactions: async () => {
        const transactions = await wallet.blockchain.getTotalTransactions()
        functions.log_numbers(transactions)
        await commands.pause()
        console.clear()
        commands.commands()
    },
    isValid: async () => {
        if (await wallet.blockchain.isChainValid()) console.log(chalk.greenBright('Valid'))
        else console.log(chalk.redBright('Invalid'))
        await commands.pause()
        console.clear()
        commands.commands()
    },
    height: async () => {
        const height = await wallet.blockchain.getHeight()
        functions.log_numbers(height)
        await commands.pause()
        console.clear()
        commands.commands()
    },
    difficulty: async () => {
        const difficulty = await wallet.blockchain.getDifficulty()
        functions.log_numbers(difficulty)
        await commands.pause()
        console.clear()
        commands.commands()
    },
    latestBlocks: async () => {
        let latestBlocks = [
            await wallet.blockchain.getLatestBlock()
        ]
        for (let i = 0; i < 9; i++) {
            const block = await wallet.blockchain.getBlockByHeight(latestBlocks[0].height - 1 - i)
            if (!block) break
            latestBlocks.push(block)
        }
        latestBlocks = latestBlocks.sort((a, b) => a.timestamp - b.timestamp)
        for (const block of latestBlocks) {
            console.log(chalk.grey(`height: ${chalk.yellowBright(block.height)}, timestamp: ${chalk.magentaBright(new Date(block.timestamp).toLocaleTimeString())}`))
        }
        await commands.pause()
        console.clear()
        commands.commands()
    }
}
commands.init()