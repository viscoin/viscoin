import Block from './class/Block'
import schema_block from './mongoose/schema/block'
export default (limit: number, skip: number) => {
    return <any> new Promise(async (resolve, reject) => {
        const blocks = await schema_block
            .find(null, null, { limit, skip, sort: { timestamp: 1 } })
            .exec()
        if (!blocks) reject()
        const _blocks = []
        for (const block of blocks) {
            _blocks.push(new Block(block))
        }
        resolve(_blocks)
    })
}