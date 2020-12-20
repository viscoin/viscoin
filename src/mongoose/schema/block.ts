import * as mongoose from 'mongoose'
import * as config from '../../../config.json'
import schema_transaction from './transaction'
const options = {}
for (const property in config.block) {
    switch (config.block[property].type) {
        case 'String':
            options[config.block[property].name] = String
            break
        case 'Number':
            options[config.block[property].name] = Number
            break
        case '[transaction]':
            options[config.block[property].name] = [schema_transaction]
            break
    }
}
export default mongoose.Schema(options, { collection: 'blocks', versionKey: false })