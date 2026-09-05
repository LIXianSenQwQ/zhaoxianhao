/**
 * cloud/functions/common/index.js
 * 公共中间件统一出口
 */
module.exports = {
  ...require('./roles'),
  ...require('./privacy'),
  ...require('./kindship'),
  ...require('./idempotency'),
  ...require('./response'),
  ...require('./audit')
};
