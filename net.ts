import * as prompts from 'prompts'
import * as net from 'net'
import * as level from 'level'
import * as fs from 'fs'

if (!fs.existsSync('./db')) fs.mkdirSync('./db')
const nodes = level('./db/nodes', { keyEncoding: 'utf8', valueEncoding: 'utf8' })
const commands = {
    commands: async () => {
        let choices: Array<{ title: string, description: string, value: Function }> = [
            { title: 'Add', description: 'Add host', value: commands.add },
            { title: 'Delete', description: 'Delete host', value: commands.del },
            { title: 'List', description: 'List hosts', value: commands.list },
            { title: 'Exit', description: 'Exits', value: commands.exit }
        ]
        const res = await prompts({
            type: 'autocomplete',
            name: 'value',
            message: 'Command',
            choices
        })
        if (typeof res.value !== 'function') {
            return console.clear()
        }
        res.value()
    },
    add: async () => {
        const res = await prompts({
            type: 'text',
            name: 'host',
            message: 'Enter host',
            validate: host => {
                console.log(host)
                if (net.isIP(host) === 0) return 'Invalid IP address'
                return true
            }
        })
        console.clear()
        if (res.host) {
            nodes.put(res.host, '0', err => {
                if (err) console.log(err)
                else console.log('Added', res.host)
                commands.commands()
            })
        }
    },
    del: async () => {
        const res = await prompts({
            type: 'text',
            name: 'host',
            message: 'Enter host to delete'
        })
        console.clear()
        if (res.host) {
            nodes.del(res.host, () => {
                console.log('Deleted', res.host)
                commands.commands()
            })
        }
    },
    pause: () => {
        return new Promise <void> (resolve => {
            process.stdin.setRawMode(true)
            process.stdin.resume()
            process.stdin.once('data', () => resolve())
        })
    },
    list: () => {
        const stream = nodes.createReadStream()
        stream.on('data', data => {
            console.log(data)
        })
        stream.on('end', async () => {
            await commands.pause()
            console.clear()
            commands.commands()
        })
    },
    exit: async () => {
        console.clear()
    }
}
commands.commands()