import base58 from '../src/base58'
import * as fs from 'fs'
import * as prompts from 'prompts'
import Address from '../src/Address'
import * as crypto from 'crypto'

(async () => {
    const { privateKey } = await prompts({
        type: 'text',
        name: 'privateKey',
        message: 'Enter Master Private Key'
    })
    if (!privateKey) return
    const address = Address.toString(Address.fromPrivateKey(base58.decode(privateKey)))
    const { confirm } = await prompts({
        type: 'toggle',
        name: 'confirm',
        message: `Is ${address} your address?`,
        initial: false,
        active: 'yes',
        inactive: 'no'
    })
    if (!confirm) return
    const { n } = await prompts({
        type: 'number',
        name: 'n',
        message: 'Enter amount of addresses to generate'
    })
    if (!n) return
    const { keys } = await prompts({
        type: 'toggle',
        name: 'keys',
        message: `Save privateKeys too?`,
        initial: false,
        active: 'yes',
        inactive: 'no'
    })
    if (!confirm) return
    console.clear()
    console.log(`Generating ${n} addresses...`)
    const wallets = []
    let timestamp = Date.now()
    for (let i = 0; i < n; i++) {
        const buffer = Buffer.alloc(4)
        buffer.writeUInt32BE(i)
        const hash = crypto.createHash('sha256').update(Buffer.concat([
            base58.decode(privateKey),
            buffer
        ])).digest()
        const address = Address.toString(Address.fromPrivateKey(hash))
        const wallet: any = {
            address
        }
        if (keys) wallet.private = base58.encode(Buffer.concat([
            base58.decode(privateKey),
            buffer
        ]))
        wallets.push(wallet)
        if (i % (n / 100) === 0) {
            const dif = Date.now() - timestamp
            timestamp = Date.now()
            console.log(`Progress ${i}/${n}. Time left ${(((1 - (i / n)) * 100 * dif) / 1000).toFixed(2)} seconds.`)
        }
    }
    console.log('Saving...')
    fs.writeFileSync('./wallets.json', JSON.stringify(wallets, null, 4))
    console.log('Successfully saved addresses to ./addresses.json')
})()