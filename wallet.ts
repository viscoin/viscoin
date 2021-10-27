import { config } from 'dotenv'
config()
import * as crypto from 'crypto'
import * as prompts from 'prompts'
import * as fs from 'fs'
import Wallet from './src/Wallet'
import base58 from './src/base58'
import * as path from 'path'
import keygen from './src/keygen'
import beautifyBigInt from './src/beautifyBigInt'
import parseBigInt from './src/parseBigInt'
import HTTPApi from './src/HTTPApi'
import * as config_settings from './config/settings.json'
import walletPassphraseHash from './src/walletPassphraseHash'
import addressFromPublicKey from './src/addressFromPublicKey'
import publicKeyFromPrivateKey from './src/publicKeyFromPrivateKey'
import Address from './src/Address'
import log from './src/log'
import * as config_default_env from './config/default_env.json'

const c = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m'
}

const HTTP_API = process.env.HTTP_API || config_default_env.HTTP_API
const host = HTTP_API.split(':').slice(0, -1).join(':'),
port = parseInt(HTTP_API.split(':').reverse()[0])
if (process.env.HTTP_API) log.info('Using HTTP_API:', { host, port })
else log.warn('Unset environment value! Using default value for HTTP_API:', { host, port })

let wallet: Wallet | undefined = undefined,
wallet_saved: boolean = false
const functions = {
    save_wallet: async (privateKey: Buffer, passphrase: string) => {
        const address = Address.fromPrivateKey(privateKey)
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-cbc', await walletPassphraseHash(passphrase), iv)
        if (!fs.existsSync('./wallets')) fs.mkdirSync('./wallets')
        fs.writeFileSync(`./wallets/${Address.toString(address)}.wallet`, Buffer.concat([
            iv,
            cipher.update(privateKey),
            cipher.final()
        ]))
    },
    log_wallet_info: (privateKey: Buffer) => {
        const address = addressFromPublicKey(publicKeyFromPrivateKey(privateKey))
        console.log(`Address     (${c.green}SHARE${c.reset})  ${Address.toString(address)}`)
        console.log(`Private key (${c.red}SECRET${c.reset}) ${base58.encode(privateKey)}`)
    },
    log_unable_to_connect_to_api: () => {
        console.log('Unable to connect to API')
    }
}
const commands = {
    commands: async () => {
        const block = await HTTPApi.getLatestBlock({ host, port })
        if (block === null) console.log(`HTTP_API ${c.red}${host}:${port}${c.reset} - Offline!`)
        else console.log(`HTTP_API ${c.green}${host}:${port}${c.reset} - Blockchain height: ${c.yellow}${block.height}${c.reset}`)
        let choices: Array<{ title: string, description: string, value: Function }> = [
            { title: 'Decrypt', description: 'Select wallet', value: commands.select_wallet },
            { title: 'Generate', description: 'Generate new wallet', value: commands.generate },
            { title: 'Import', description: 'Import new wallet', value: commands.import_privateKey },
            { title: 'Exit', description: 'Exits', value: commands.exit }
        ]
        if (wallet !== undefined) {
            choices = [
                { title: 'Address', description: 'Show wallet address', value: commands.address },
                { title: 'Balance', description: 'Get balance of wallet address', value: commands.balance },
                { title: 'Send', description: 'New transaction', value: commands.send },
                { title: 'Wallet', description: `View wallet details (Make sure no one is looking)`, value: commands.info },
                ...choices
            ]
            console.log(path.join(__dirname, 'wallets', `${c.blue}${wallet.address}.wallet${c.reset}`))
            if (wallet_saved === false) {
                console.log(`Temporarily loaded wallet (${c.red}not saved${c.reset})`)
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
        functions.log_wallet_info(wallet.privateKey)
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
                    if (to === '') return true
                    try {
                        if (Address.verifyChecksumAddress(base58.decode(to))) return true
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
                    const transaction = `Raw signed transaction copy/paste\n\n${JSON.stringify(wallet.createTransaction({
                        to: values.to === undefined ? undefined : base58.decode(values.to),
                        amount: values.amount === undefined ? undefined : beautifyBigInt(parseBigInt(values.amount)),
                        minerFee: beautifyBigInt(parseBigInt(values.minerFee))
                    }))}`
                    if (values.amount !== undefined) return `Sum: ${beautifyBigInt(parseBigInt(values.amount))} + ${beautifyBigInt(parseBigInt(values.minerFee))} = ${beautifyBigInt(parseBigInt(values.amount) + parseBigInt(values.minerFee))}\n\n${transaction}\n\nBroadcast transaction?`
                    else return `Sum: ${values.minerFee}\n\n${transaction}\n\nBroadcast transaction?`
                },
                initial: false,
                active: 'yes',
                inactive: 'no'
            }
        ])
        if (res.confirm === true) {
            let to
            if (res.to) to = Address.toBuffer(res.to)
            const transaction = wallet.createTransaction({
                to,
                amount: res.amount === undefined ? undefined : beautifyBigInt(parseBigInt(res.amount)),
                minerFee: beautifyBigInt(parseBigInt(res.minerFee))
            })
            try {
                const code = BigInt(await HTTPApi.send({ host, port }, transaction))
                if (code) console.log(`Transaction rejected 0x${code.toString(16)}`)
                else console.log('\x1b[32mTransaction accepted\x1b[0m')
            }
            catch {
                functions.log_unable_to_connect_to_api()
            }
            await commands.pause()
        }
        console.clear()
        commands.commands()
    },
    address: async () => {
        console.log(wallet.address)
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
                    try {
                        if (Address.verifyChecksumAddress(base58.decode(address))) return true
                        else return 'Invalid address'
                    }
                    catch {
                        return 'Invalid base58'
                    }
                }
            }
        ])
        if (res.this === false && res.address === undefined) {
            console.clear()
            return commands.commands()
        }
        try {
            console.log(await HTTPApi.getBalanceOfAddress({ host, port }, res.address === undefined ? wallet.address : res.address))
        }
        catch {
            functions.log_unable_to_connect_to_api()
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
        const privateKey = keygen()
        wallet = new Wallet(privateKey)
        wallet_saved = false
        functions.log_wallet_info(privateKey)
        const { save } = await prompts({
            type: 'toggle',
            name: 'save',
            message: 'Save key?',
            initial: false,
            active: 'yes',
            inactive: 'no'
        })
        if (save === false) {
            console.clear()
            return commands.commands()
        }
        const { passphrase } = await prompts({
            type: 'password',
            name: 'passphrase',
            message: 'Enter passphrase'
        })
        if (passphrase === undefined || passphrase === undefined) {
            console.clear()
            return commands.commands()
        }
        functions.save_wallet(privateKey, passphrase)
        wallet_saved = true
        console.clear()
        commands.commands()
    },
    save: async () => {
        functions.log_wallet_info(wallet.privateKey)
        const { save } = await prompts({
            type: 'toggle',
            name: 'save',
            message: 'Save key?',
            initial: false,
            active: 'yes',
            inactive: 'no'
        })
        if (save === false) {
            console.clear()
            return commands.commands()
        }
        const { passphrase } = await prompts({
            type: 'password',
            name: 'passphrase',
            message: 'Enter passphrase'
        })
        if (passphrase === undefined || passphrase === undefined) {
            console.clear()
            return commands.commands()
        }
        functions.save_wallet(wallet.privateKey, passphrase)
        wallet_saved = true
        console.clear()
        commands.commands()
    },
    decrypt_wallet: async (address) => {
        if (!fs.existsSync(`./wallets/${address}.wallet`)) {
            console.log('Wallet not found')
            return commands.select_wallet()
        }
        const data = fs.readFileSync(`./wallets/${address}.wallet`)
        await prompts({
            type: 'password',
            name: 'passphrase',
            message: 'Enter passphrase',
            validate: async passphrase => {
                try {
                    const decipher = crypto.createDecipheriv('aes-256-cbc', await walletPassphraseHash(passphrase), data.slice(0, 16))
                    const privateKey = Buffer.concat([
                        decipher.update(data.slice(16)),
                        decipher.final()
                    ])
                    wallet = new Wallet(privateKey)
                    wallet_saved = true
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
            console.log('No stored wallets found')
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
        const { address } = await prompts({
            type: 'autocomplete',
            name: 'address',
            message: 'Select wallet',
            choices
        })
        commands.decrypt_wallet(address)
    },
    pause: () => {
        return new Promise <void> (resolve => {
            process.stdin.setRawMode(true)
            process.stdin.resume()
            process.stdin.once('data', () => resolve())
        })
    },
    import_privateKey: async () => {
        const res = await prompts({
            type: 'text',
            name: 'privateKey',
            message: 'Enter privateKey (base58)',
            validate: async privateKey => {
                try {
                    new Wallet(base58.decode(privateKey))
                    return true
                }
                catch {
                    return 'Invalid privateKey'
                }
            }
        })
        if (res.privateKey === undefined) {
            console.clear()
            return commands.commands()
        }
        const privateKey = base58.decode(res.privateKey)
        functions.log_wallet_info(privateKey)
        wallet = new Wallet(privateKey)
        wallet_saved = false
        const { save } = await prompts({
            type: 'toggle',
            name: 'save',
            message: 'Save key?',
            initial: false,
            active: 'yes',
            inactive: 'no'
        })
        if (save === false) {
            console.clear()
            return commands.commands()
        }
        const { passphrase } = await prompts({
            type: 'password',
            name: 'passphrase',
            message: 'Enter passphrase'
        })
        if (passphrase === undefined || passphrase === undefined) {
            console.clear()
            return commands.commands()
        }
        functions.save_wallet(privateKey, passphrase)
        wallet_saved = true
        console.clear()
        commands.commands()
    }
}
commands.commands()