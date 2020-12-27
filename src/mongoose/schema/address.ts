import * as mongoose from 'mongoose'
import * as config from '../../../config.json'
const options = {}
for (const property in config.mongoose.schema.address) {
    options[config.mongoose.schema.address[property].name] = config.mongoose.schema.address[property].type
}
export default mongoose.Schema(options, { collection: 'addresses', versionKey: false })