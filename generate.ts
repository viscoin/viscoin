import publicKeyFromPrivateKey from './src/publicKeyFromPrivateKey'
import addressFromPublicKey from './src/addressFromPublicKey'
import base58 from './src/base58'
import * as fs from 'fs'
import * as prompts from 'prompts'
import Address from './src/Address'

(async () => {
    const { privateKey } = await prompts({
        type: 'text',
        name: 'privateKey',
        message: 'Enter Master Private Key'
    })
    if (!privateKey) return
    const address = Address.toString(Address.fromPrivateKey(privateKey))
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
    const addresses = [],
    privateKeys = []
    let timestamp = Date.now()
    for (let i = 0; i < n; i++) {
        const buffer = Buffer.alloc(4)
        buffer.writeUInt32BE(i)
        const address = Address.toString(Address.fromPrivateKey(Buffer.concat([
            base58.decode(privateKey),
            buffer
        ])))
        addresses.push(address)
        if (keys) privateKeys.push(base58.encode(Buffer.concat([
            base58.decode(privateKey),
            buffer
        ])))
        if (i % (n / 100) === 0) {
            const dif = Date.now() - timestamp
            timestamp = Date.now()
            console.log(`Progress ${i}/${n}. Time left ${(((1 - (i / n)) * 100 * dif) / 1000).toFixed(2)} seconds.`)
        }
    }
    console.log('Saving...')
    fs.writeFileSync('./addresses.json', JSON.stringify(addresses, null, 4))
    console.log('Successfully saved addresses to ./addresses.json')
    if (keys) {
        fs.writeFileSync('./keys.json', JSON.stringify(privateKeys, null, 4))
        console.log('Successfully saved keys to ./keys.json')
    }
})()