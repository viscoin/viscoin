import * as mongoose from 'mongoose'
import schema_address from '../schema/address'
export default mongoose.model("Address", schema_address)