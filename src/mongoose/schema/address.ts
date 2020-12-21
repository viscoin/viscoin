import * as mongoose from 'mongoose'
import * as config from '../../../config.json'
const options = {}
for (const property in config.address) {
    options[config.address[property].name] = config.address[property].type
}
export default mongoose.Schema(options, { collection: 'addresses', versionKey: false })