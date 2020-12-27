import mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import * as prompts from 'prompts'
import * as chalk from 'chalk'
import * as fs from 'fs'
import Wallet from './src/Wallet'
import base58 from './src/base58'
import customHash from './src/customHash'
import * as path from 'path'
import wordgen from './src/wordgen'
import wordsToKey from './src/wordsToKey'
import beautifyBigInt from './src/beautifyBigInt'
import parseBigInt from './src/parseBigInt'
import HTTPApi from './src/HTTPApi'
import * as config from './config.json'
import Transaction from './src/Transaction'

let wallet: Wallet | undefined = undefined

const functions = {
    save_wallet: (privateKey: Buffer, words: Array<string>, name: string, passphrase: string) => {
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-cbc', customHash(passphrase), iv)
        if (!fs.existsSync('./wallets')) fs.mkdirSync('./wallets')
        fs.writeFileSync(`./wallets/${name}.wallet`, Buffer.concat([
            iv,
            cipher.update(JSON.stringify({
                privateKey,
                words
            })),
            cipher.final()
        ]))
    },
    log_wallet_info: (address: Buffer, privateKey: Buffer, words: Array<string>) => {
        console.log(`${chalk.whiteBright.bold('Address')}        (${chalk.greenBright('SHARE')})  ${chalk.blueBright(base58.encode(address))}`)
        console.log(`${chalk.whiteBright.bold('Private key')}    (${chalk.redBright('SECRET')}) ${chalk.blueBright(base58.encode(privateKey))}`)
        console.log(`${chalk.whiteBright.bold('Recovery words')} (${chalk.redBright('SECRET')}) ${chalk.blueBright(words.join(' '))}`)
    }
}

const commands = {
    commands: async () => {
        let choices: Array<{ title: string, description: string, value: Function }> = [
            { title: 'Wallet', description: 'Select wallet', value: commands.select_wallet },
            { title: 'Ping', description: 'API node status', value: commands.ping },
            { title: 'Generate', description: 'Generate new wallet', value: commands.generate },
            { title: 'Import', description: 'Import new wallet', value: commands.import_wallet },
            { title: 'Exit', description: 'Exits', value: commands.exit }
        ]
        if (wallet) {
            choices = [
                { title: 'Address', description: 'Show wallet address', value: commands.address },
                { title: 'Balance', description: 'Get balance of wallet address', value: commands.balance },
                { title: 'Send', description: 'New transaction', value: commands.send },
                { title: 'Transactions', description: 'Lists transaction history', value: commands.transactions },
                { title: 'Info', description: `View sensitive details about wallet (${chalk.redBright('Make sure no one is looking')})`, value: commands.info },
                ...choices
            ]
            if (wallet.name) console.log(chalk.grey(path.join(__dirname, 'wallets', chalk.blueBright(`${wallet.name}.wallet`))))
            else if (wallet.address && wallet.privateKey) {
                console.log(chalk.grey(`${chalk.redBright('Temporarily')} loaded wallet ${chalk.white('(not saved)')}`))
                choices = [
                    { title: 'Save', description: 'Save wallet', value: commands.save },
                    ...choices
                ]
            }
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
    info: async () => {
        functions.log_wallet_info(wallet.address, wallet.privateKey, wallet.words)
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
                    if (!to) return true
                    try {
                        if (Buffer.byteLength(base58.decode(to)) === 20) return true
                        else return 'Invalid address'
                    }
                    catch {
                        return 'Invalid base58'
                    }
                }
            },
            {
                type: previous => previous ? 'text' : null,
                name: 'amount',
                message: 'Amount',
                validate: amount => {
                    const _amount = parseBigInt(amount)
                    if (_amount === null || _amount <= 0) return 'Invalid amount'
                    else return true
                }
            },
            {
                type: 'text',
                name: 'data',
                message: 'Hex data (optional)',
                validate: data => Buffer.from(data, 'hex').toString('hex') === data ? true : 'Invalid hex'
            },
            {
                type: 'text',
                name: 'minerFee',
                message: 'Miners fee',
                validate: minerFee => {
                    const _minerFee = parseBigInt(minerFee)
                    if (_minerFee === null || _minerFee < 0) return 'Invalid amount'
                    else return true
                }
            },
            {
                type: 'toggle',
                name: 'confirm',
                message: (prev, values) => {
                    if (values.amount) return `Sum: ${beautifyBigInt(parseBigInt(values.amount))} + ${beautifyBigInt(parseBigInt(values.minerFee))} = ${beautifyBigInt(parseBigInt(values.amount) + parseBigInt(values.minerFee))}\nSign and broadcast?`
                    else return `Sum: ${values.minerFee}\nSign and broadcast?`
                },
                initial: false,
                active: 'yes',
                inactive: 'no'
            }
        ])
        let data = res.data
        if (data) data = Buffer.from(data, 'hex')
        else data = undefined
        if (res.confirm) {
            let amount = undefined
            if (res.amount !== undefined) amount = beautifyBigInt(parseBigInt(res.amount))
            const transaction = wallet.createTransaction({
                to: base58.decode(res.to),
                amount,
                minerFee: beautifyBigInt(parseBigInt(res.minerFee)),
                data
            })
            for (let i = 0; i < config.Wallet.timesToRepeatBroadcastTransaction; i++) {
                setTimeout(async () => {
                    await HTTPApi.send(transaction)
                }, Math.pow(i, 2) * 1000)
            }
            await commands.pause()
        }
        console.clear()
        commands.commands()
    },
    address: async () => {
        console.log(chalk.blueBright(base58.encode(wallet.address)))
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
                    // if (!address) return true
                    try {
                        if (Buffer.byteLength(base58.decode(address)) === 20) return true
                        else return 'Invalid address'
                    }
                    catch {
                        return 'Invalid base58'
                    }
                }
            }
        ])
        if (!res.this && res.address === undefined) {
            console.clear()
            return commands.commands()
        }
        try {
            let balance = null
            if (res.address === undefined) {
                balance = await wallet.balance()
            }
            else {
                balance = await HTTPApi.balanceAddress(res.address)
            }
            console.log(chalk.yellowBright(balance))
        }
        catch {
            console.log(chalk.redBright('Unable to connect to api node'))
        }
        await commands.pause()
        console.clear()
        commands.commands()
    },
    exit: () => {
        wallet = undefined
        console.clear()
        process.exit(0)
    },
    generate: async () => {
        const words = wordgen()
        console.log(chalk.yellowBright('Write down the following words and store them somewhere safe.'))
        console.log(chalk.yellowBright('The words can be used to recover / regenerate your private key.'))
        console.log(chalk.redBright(`Do ${chalk.bold('not')} share this with anyone as they can get access to your wallet!`))
        for (let i = 0; i < words.length; i++) {
            console.log(`${chalk.whiteBright(i + 1)}${chalk.white('.')} ${chalk.greenBright.bold(words[i])}`)
        }
        await commands.pause()
        console.clear()
        const { words_confirm } = await prompts({
            type: 'text',
            name: 'words_confirm',
            message: 'Confirm words 1 - 12 (space separated)',
            validate: words_confirm => words_confirm.split(' ').join('') === words.join('') ? true : "Words don't match"
        })
        if (words_confirm === undefined) {
            console.clear()
            return commands.commands()
        }
        const { privateKey, address } = wordsToKey(words)
        functions.log_wallet_info(address, privateKey, words)
        wallet = new Wallet(Wallet.import({ name: '', privateKey, words }))
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
        functions.save_wallet(privateKey, words, name, passphrase)
        wallet.name = name
        console.clear()
        commands.commands()
    },
    save: async () => {
        functions.log_wallet_info(wallet.address, wallet.privateKey, wallet.words)
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
        functions.save_wallet(wallet.privateKey, wallet.words, name, passphrase)
        wallet.name = name
        console.clear()
        commands.commands()
    },
    ping: async () => {
        try {
            if (await HTTPApi.ping()) console.log(chalk.greenBright('Connected'))
        }
        catch {
            console.log(chalk.redBright('Unable to connect to api node'))
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
                    const decrypted = JSON.parse(String(Buffer.concat([
                        decipher.update(data.slice(16)),
                        decipher.final()
                    ])))
                    const privateKey = Buffer.from(decrypted.privateKey)
                    const words = decrypted.words
                    wallet = new Wallet(Wallet.import({ name, privateKey, words }))
                    return true
                }
                catch {
                    return 'Failed to decrypt'
                }
            }
        })
        console.clear()
        commands.commands()
    },
    select_wallet: async () => {
        wallet = undefined
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
    pause: () => {
        return new Promise <void> (resolve => {
            process.stdin.setRawMode(true)
            process.stdin.resume()
            process.stdin.once('data', () => resolve())
        })
    },
    import_wallet: async () => {
        const res = await prompts({
            type: 'text',
            name: 'words',
            message: 'Enter the 12 word recovery passphrase 1 - 12 (space separated)',
            validate: words => words.split(' ').length === 12 ? true : 'Invalid length'
        })
        if (res.words === undefined) {
            console.clear()
            return commands.commands()
        }
        const words = res.words.split(' ')
        const { address, privateKey } = wordsToKey(words)
        functions.log_wallet_info(address, privateKey, words)
        wallet = new Wallet(Wallet.import({ name: '', privateKey, words }))
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
        functions.save_wallet(privateKey, words, name, passphrase)
        wallet.name = name
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
                    // if (!address) return true
                    try {
                        if (Buffer.byteLength(base58.decode(address)) === 20) return true
                        else return 'Invalid address'
                    }
                    catch {
                        return 'Invalid base58'
                    }
                }
            }
        ])
        if (!res.this && res.address === undefined) {
            console.clear()
            return commands.commands()
        }
        try {
            let transactions = null
            if (res.address === undefined) {
                transactions = await wallet.transactions()
            }
            else {
                transactions = await HTTPApi.transactionsAddress(res.address)
            }
            if (transactions.length) {
                for (const transaction of transactions.sort((a, b) => a.timestamp - b.timestamp).map(e => new Transaction(Transaction.beautify(e)))) {
                    const date = chalk.magentaBright(new Date(transaction.timestamp).toLocaleTimeString()),
                    arrow = chalk.magentaBright('→')
                    let data = ''
                    if (transaction.data) data = `\n ${chalk.magentaBright('⤷')} ${chalk.grey(transaction.data.toString('hex'))}`
                    if (transaction.from && transaction.from.equals(wallet.address)) transaction.from = chalk.blueBright(base58.encode(transaction.from))
                    else if (transaction.from) transaction.from = base58.encode(transaction.from)
                    if (transaction.to && transaction.to.equals(wallet.address)) transaction.to = chalk.blueBright(base58.encode(transaction.to))
                    else if (transaction.to) transaction.to = base58.encode(transaction.to)
                    if (!transaction.from) console.log(`${date} ${transaction.to} ${chalk.greenBright.bold(`+${beautifyBigInt(parseBigInt(transaction.amount))}`)}`)
                    else if (!transaction.to) console.log(`${date} ${transaction.from} ${chalk.redBright.bold(`-${beautifyBigInt(parseBigInt(transaction.minerFee))}`)}${data}`)
                    else console.log(`${date} ${transaction.from} ${chalk.redBright.bold(`-${beautifyBigInt(parseBigInt(transaction.amount) + parseBigInt(transaction.minerFee))}`)} ${arrow} ${transaction.to} ${chalk.greenBright.bold(`+${beautifyBigInt(parseBigInt(transaction.amount))}`)}${data}`)
                }
            }
            else {
                console.log(chalk.redBright('No transactions'))
            }
        }
        catch (err) {
            console.log(chalk.redBright('Unable to connect to api node'))
            console.log(err)
        }
        await commands.pause()
        console.clear()
        commands.commands()
    }
}
commands.commands()