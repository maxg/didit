var fs = require('fs');

var env = process.env.NODE_ENV || 'development';
module.exports = require('./config/' + env);

[ 'footer', 'swf' ].forEach(function(config) {
  module.exports[config] = JSON.parse(fs.readFileSync('./config/' + config + '.json'));
});

require('./logger').cat('config').info('using ' + env + ' configuration');
