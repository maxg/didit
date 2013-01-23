var fs = require('fs');

var env = process.env.NODE_ENV || 'development';
console.log('[config]', 'using ' + env + ' configuration');
module.exports = require('./config/' + env);

[ 'footer', 'swf' ].forEach(function(config) {
  module.exports[config] = JSON.parse(fs.readFileSync('./config/' + config + '.json'));
});
